import { nextRetryAt } from "../_shared/cfdiRetryQueue.ts";
import { getRetryAwareFacturapiConfig } from "../_shared/facturapi/retryContext.ts";
import type { readStampOutcome } from "../_shared/stampOutcome.ts";
import { decideTerminalStatus } from "./decisions.ts";
import {
  type AdminClient,
  is409Deferrable,
  isDocCancelled,
  MAX_DEFERRALS,
  operationTable,
  type QueueResult,
  type QueueRow,
  refreshCancellationBestEffort,
} from "./invokeTarget.ts";
import { markOwnedQueueRow, type QueueLease } from "./queueLease.ts";

export async function prepareCancelRow(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  envGet: (key: string) => string | undefined;
}): Promise<QueueResult | null> {
  const { admin, lease, row, envGet } = params;
  const table = operationTable(row.operation);
  const document = await admin
    .from(table)
    .select("organization_id")
    .eq("id", row.invoice_id)
    .eq("organization_id", lease.organizationId)
    .maybeSingle();
  if (document.error || !document.data) {
    await markOwnedQueueRow(admin, lease, {
      status: document.error ? "pending" : "exhausted",
      attempts: row.attempts,
      last_error: "No se pudo verificar el documento fiscal de esta empresa.",
      next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
    });
    return {
      id: row.id,
      status: document.error
        ? "deferred_document_read_error"
        : "document_unavailable",
    };
  }
  await getRetryAwareFacturapiConfig({
    admin,
    env: envGet,
    organizationId: lease.organizationId,
    documentId: row.invoice_id,
    operation: row.operation,
    isServiceRole: true,
    body: { retry_queue: { id: lease.id, token: lease.updatedAt } },
  });
  return null;
}

async function handleDeferrable409(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nowIso: string;
  projectRef: string;
  serviceKey: string;
  fetchFn: typeof fetch;
  httpStatus: number;
  errMsg: string;
}): Promise<QueueResult> {
  const {
    admin,
    lease,
    row,
    nowIso,
    projectRef,
    serviceKey,
    fetchFn,
    httpStatus,
    errMsg,
  } = params;
  const deferrals = (row.deferrals ?? 0) + 1;
  await refreshCancellationBestEffort({
    admin,
    lease,
    row,
    projectRef,
    serviceKey,
    fetchFn,
  });

  if (
    await isDocCancelled(
      admin,
      row.operation,
      row.invoice_id,
      lease.organizationId,
    )
  ) {
    await markOwnedQueueRow(admin, lease, {
      status: "succeeded",
      attempts: row.attempts,
      last_error: null,
      deferrals: 0,
    });
    return { id: row.id, status: "succeeded", http: httpStatus };
  }

  if (deferrals > MAX_DEFERRALS) {
    await markOwnedQueueRow(admin, lease, {
      status: "exhausted",
      attempts: row.attempts,
      deferrals,
      last_error:
        `MAX_DEFERRALS=${MAX_DEFERRALS} alcanzado tras ${deferrals} aplazamientos; último 409: ${
          String(errMsg)
        }`.slice(0, 2000),
      next_retry_at: nowIso,
    });
    return { id: row.id, status: "exhausted", http: httpStatus };
  }

  await markOwnedQueueRow(admin, lease, {
    status: "pending",
    attempts: row.attempts,
    deferrals,
    last_error: String(errMsg).slice(0, 2000),
    next_retry_at: nextRetryAt(deferrals).toISOString(),
  });
  return { id: row.id, status: "retry_claim_pending", http: httpStatus };
}

export async function handleNonSuccessInvocation(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
  nowIso: string;
  projectRef: string;
  serviceKey: string;
  fetchFn: typeof fetch;
  invRes: { ok: boolean; status: number; body: unknown };
  stampResult: ReturnType<typeof readStampOutcome>;
}): Promise<QueueResult> {
  const {
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
  } = params;
  const errMsg = (invRes.body as { error?: string } | null)?.error ??
    String(invRes.body);

  if (invRes.status === 409 && is409Deferrable(row.operation, invRes.body)) {
    return await handleDeferrable409({
      admin,
      lease,
      row,
      nowIso,
      projectRef,
      serviceKey,
      fetchFn,
      httpStatus: invRes.status,
      errMsg,
    });
  }

  const queueStatus = invRes.status === 409 || stampResult?.kind === "rejected"
    ? "exhausted"
    : decideTerminalStatus(nextAttempts, row.max_attempts);
  await markOwnedQueueRow(admin, lease, {
    status: queueStatus,
    attempts: nextAttempts,
    deferrals: 0,
    last_error: String(errMsg).slice(0, 2000),
    next_retry_at: queueStatus === "exhausted"
      ? nowIso
      : nextRetryAt(nextAttempts).toISOString(),
  });
  return {
    id: row.id,
    status: queueStatus === "exhausted" ? "exhausted" : "retry",
    http: invRes.status,
  };
}
