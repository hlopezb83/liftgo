// EC-A1 — Consumidor de la cola cfdi_retry_queue.
// Corre por cron (pg_cron cada 5 min). Endpoint protegido con CRON_SECRET.
import { handleCors } from "../_shared/cors.ts";
import { authenticateCronRequest } from "../_shared/cronAuth.ts";
import { wrapEdgeFunction } from "../_shared/edgeSentry.ts";
import { FiscalRetryContextError } from "../_shared/facturapi/retryContext.ts";
import { jsonResponse } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/supabaseClients.ts";
import {
  handleNonSuccessInvocation,
  prepareCancelRow,
} from "./cancelRowProcessor.ts";
import {
  type AdminClient,
  CANCELLATION_IN_PROGRESS_CODE,
  type HandleRequestDeps,
  invokeStampFn,
  is409Deferrable,
  MAX_DEFERRALS,
  OPERATION_TO_FUNCTION,
  type QueueResult,
  type QueueRow,
} from "./invokeTarget.ts";
import {
  assertOwnedQueue,
  claimQueueLease,
  markOwnedQueueRow,
  type QueueLease,
} from "./queueLease.ts";
import { handleRowException } from "./rowErrorHandler.ts";
import {
  handleStampInvocationOutcome,
  prepareStampRow,
} from "./stampRowProcessor.ts";

export {
  CANCELLATION_IN_PROGRESS_CODE,
  type HandleRequestDeps,
  is409Deferrable,
  MAX_DEFERRALS,
  OPERATION_TO_FUNCTION,
};

const RUN_BUDGET_MS = 50_000;
const RUN_PENDING_LIMIT = 10;
const RUN_STALE_LIMIT = 5;
const STALE_PROCESSING_MIN = 15;
const QUEUE_COLUMNS =
  "id, organization_id, updated_at, operation, invoice_id, attempts, max_attempts, payload, status, deferrals, last_error";

function resolveEnvConfig(envGet: (key: string) => string | undefined): {
  serviceKey: string;
  projectRef: string;
} | null {
  const serviceKey = envGet("SUPABASE_SERVICE_ROLE_KEY");
  const projectRef =
    (envGet("SUPABASE_URL") ?? "").match(/https:\/\/([^.]+)\./)?.[1] ??
      envGet("SUPABASE_PROJECT_ID") ?? "";
  if (!serviceKey || !projectRef) return null;
  return { serviceKey, projectRef };
}

async function fetchQueueBatch(
  admin: AdminClient,
  nowIso: string,
  staleCutoff: string,
): Promise<{ ok: true; queue: QueueRow[] } | { ok: false }> {
  const { data: pendingRows, error } = await admin
    .from("cfdi_retry_queue")
    .select(QUEUE_COLUMNS)
    .eq("status", "pending")
    .lte("next_retry_at", nowIso)
    .order("next_retry_at", { ascending: true })
    .limit(RUN_PENDING_LIMIT);

  if (error) {
    console.error("[process-cfdi-retry-queue] fetch failed", error);
    return { ok: false };
  }

  const { data: staleRows, error: staleErr } = await admin
    .from("cfdi_retry_queue")
    .select(QUEUE_COLUMNS)
    .eq("status", "processing")
    .lt("updated_at", staleCutoff)
    .order("updated_at", { ascending: true })
    .limit(RUN_STALE_LIMIT);

  if (staleErr) {
    console.error(
      "[process-cfdi-retry-queue] stale processing fetch failed",
      staleErr,
    );
  }

  const queue = [
    ...((pendingRows ?? []) as QueueRow[]),
    ...((staleRows ?? []) as QueueRow[]),
  ].slice(0, RUN_PENDING_LIMIT);
  return { ok: true, queue };
}

function assertRetryResponseCode(body: unknown): void {
  const code = (body as { code?: string } | null)?.code;
  if (code === "FISCAL_RETRY_CHANGED") {
    throw new FiscalRetryContextError("changed");
  }
  if (code === "FISCAL_RETRY_UNAVAILABLE") {
    throw new FiscalRetryContextError("unavailable");
  }
}

async function executeOwnedRow(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  fnName: string | undefined;
  nextAttempts: number;
  nowIso: string;
  serviceKey: string;
  projectRef: string;
  envGet: (key: string) => string | undefined;
  deps: HandleRequestDeps;
}): Promise<QueueResult> {
  const {
    admin,
    lease,
    row,
    fnName,
    nextAttempts,
    nowIso,
    serviceKey,
    projectRef,
    envGet,
    deps,
  } = params;
  if (!fnName) {
    await markOwnedQueueRow(admin, lease, {
      status: "exhausted",
      last_error: `Unknown operation: ${row.operation}`,
    });
    return { id: row.id, status: "exhausted" };
  }

  const preflight = row.operation === "stamp"
    ? await prepareStampRow({
      admin,
      lease,
      row,
      nextAttempts,
      envGet,
      lookup: deps.lookup,
    })
    : await prepareCancelRow({ admin, lease, row, envGet });
  if (preflight) return preflight;

  await assertOwnedQueue(admin, lease);
  const fetchFn = deps.fetch ?? fetch;
  const invRes = await invokeStampFn({
    fnName,
    operation: row.operation,
    invoiceId: row.invoice_id,
    serviceKey,
    projectRef,
    payload: row.payload ?? {},
    fetchFn,
    retryContext: { id: lease.id, token: lease.updatedAt },
  });
  assertRetryResponseCode(invRes.body);

  let stampResult = null;
  if (row.operation === "stamp") {
    const outcome = await handleStampInvocationOutcome({
      admin,
      lease,
      row,
      nextAttempts,
      invRes,
    });
    if (outcome.handled) return outcome.handled;
    stampResult = outcome.stampResult;
  } else if (invRes.ok) {
    await markOwnedQueueRow(admin, lease, {
      status: "succeeded",
      attempts: nextAttempts,
      last_error: null,
      deferrals: 0,
    });
    return { id: row.id, status: "succeeded", http: invRes.status };
  }

  return await handleNonSuccessInvocation({
    admin,
    lease,
    row,
    nextAttempts,
    nowIso,
    projectRef,
    serviceKey,
    fetchFn,
    invRes,
    stampResult,
  });
}

async function processQueueRow(params: {
  admin: AdminClient;
  row: QueueRow;
  nowIso: string;
  serviceKey: string;
  projectRef: string;
  envGet: (key: string) => string | undefined;
  deps: HandleRequestDeps;
}): Promise<QueueResult> {
  const { admin, row, nowIso, serviceKey, projectRef, envGet, deps } = params;
  let lease: QueueLease | null;
  try {
    lease = await claimQueueLease(admin, row, nowIso);
  } catch {
    return { id: row.id, status: "claim_error" };
  }
  if (!lease) return { id: row.id, status: "claim_skipped" };

  const nextAttempts = row.attempts + 1;
  try {
    return await executeOwnedRow({
      admin,
      lease,
      row,
      fnName: OPERATION_TO_FUNCTION[row.operation],
      nextAttempts,
      nowIso,
      serviceKey,
      projectRef,
      envGet,
      deps,
    });
  } catch (err) {
    return await handleRowException({
      admin,
      lease,
      row,
      nextAttempts,
      nowIso,
      err,
    });
  }
}

export async function handleRequest(
  req: Request,
  deps: HandleRequestDeps = {},
): Promise<Response> {
  const startedAt = Date.now();
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const json = (b: unknown, status: number) => jsonResponse(req, b, { status });
  const envGet = deps.env ?? ((k: string) => Deno.env.get(k));

  const envCfg = resolveEnvConfig(envGet);
  if (!envCfg) {
    console.error("[process-cfdi-retry-queue] missing env");
    return json({ error: "Server misconfigured" }, 500);
  }

  const admin = (deps.admin ?? getAdminClient()) as unknown as AdminClient;
  const auth = await (deps.authenticate ?? authenticateCronRequest)(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  const nowIso = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MIN * 60_000)
    .toISOString();
  const batch = await fetchQueueBatch(admin, nowIso, staleCutoff);
  if (!batch.ok) return json({ error: "Queue fetch failed" }, 500);

  const results: QueueResult[] = [];
  let truncated = false;
  for (const row of batch.queue) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) {
      truncated = true;
      break;
    }
    results.push(
      await processQueueRow({
        admin,
        row,
        nowIso,
        serviceKey: envCfg.serviceKey,
        projectRef: envCfg.projectRef,
        envGet,
        deps,
      }),
    );
  }

  return json({ processed: results.length, truncated, results }, 200);
}

if (import.meta.main) {
  Deno.serve(
    wrapEdgeFunction("process-cfdi-retry-queue", (req) => handleRequest(req)),
  );
}
