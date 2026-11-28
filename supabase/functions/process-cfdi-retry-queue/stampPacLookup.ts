import { createFacturapiClient } from "../_shared/facturapi/client.ts";
import { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import {
  FiscalRetryContextError,
  getRetryAwareFacturapiConfig,
} from "../_shared/facturapi/retryContext.ts";
import { readStampOutcome } from "../_shared/stampOutcome.ts";
import {
  type AdminClient,
  deferStamp,
  type QueueResult,
  type QueueRow,
} from "./invokeTarget.ts";
import {
  assertOwnedQueue,
  markOwnedQueueRow,
  type QueueLease,
} from "./queueLease.ts";
import {
  type RecoveryInvoice,
  saveRecoveredInvoice,
} from "./recoveredInvoice.ts";

export async function resolveStampPacConfig(params: {
  admin: AdminClient;
  envGet: (key: string) => string | undefined;
  organizationId: string;
  lease: QueueLease;
  row: QueueRow;
}): Promise<{ apiKey: string | null; pacMode?: "test" | "live" }> {
  try {
    const cfg = await getRetryAwareFacturapiConfig({
      admin: params.admin,
      env: params.envGet,
      organizationId: params.organizationId,
      body: {
        retry_queue: { id: params.lease.id, token: params.lease.updatedAt },
      },
      isServiceRole: true,
      documentId: params.row.invoice_id,
      operation: params.row.operation,
    });
    return { apiKey: cfg.apiKey, pacMode: cfg.mode };
  } catch (err) {
    if (err instanceof FiscalRetryContextError) throw err;
    console.error("[process-cfdi-retry-queue] config lookup failed", {
      organization_id: params.organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { apiKey: null };
  }
}

export async function runPacRecoveryLookup(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
  apiKey: string;
  pacMode: "test" | "live";
  invRowFull: unknown;
  facturapiInvoiceId: string | null;
  lookupFn: typeof lookupPacInvoice;
}): Promise<QueueResult | null> {
  const {
    admin,
    lease,
    row,
    nextAttempts,
    apiKey,
    pacMode,
    invRowFull,
    facturapiInvoiceId,
    lookupFn,
  } = params;
  await assertOwnedQueue(admin, lease);
  const pacClient = createFacturapiClient(apiKey);
  const pac = await lookupFn(pacClient, row.invoice_id, facturapiInvoiceId);
  if (pac.kind === "hit" || pac.kind === "pending") {
    await saveRecoveredInvoice(
      admin,
      lease,
      row.invoice_id,
      invRowFull as RecoveryInvoice,
      pac,
      pacMode,
    );
    await markOwnedQueueRow(admin, lease, {
      status: "succeeded",
      attempts: nextAttempts,
      last_error: null,
    });
    return {
      id: row.id,
      status: pac.kind === "hit"
        ? "succeeded_recovered_from_pac"
        : "succeeded_pac_pending",
    };
  }
  if (pac.kind === "failed") {
    await saveRecoveredInvoice(
      admin,
      lease,
      row.invoice_id,
      invRowFull as RecoveryInvoice,
      pac,
      pacMode,
    );
    await markOwnedQueueRow(admin, lease, {
      status: "exhausted",
      attempts: nextAttempts,
      last_error: "Facturapi confirmó fallo; revisión manual requerida",
    });
    return { id: row.id, status: "pac_failed_manual_review" };
  }
  if (pac.kind === "lookup_failed") {
    throw new Error("Facturapi lookup inconcluso");
  }
  return null;
}

function isUnconfirmedStampResponse(
  stampResult: ReturnType<typeof readStampOutcome>,
  invRes: { ok: boolean; status: number },
): boolean {
  if (stampResult === null) return invRes.ok || invRes.status === 409;
  return stampResult.kind === "in_progress" ||
    stampResult.kind === "recovery_required";
}

export async function handleStampInvocationOutcome(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
  invRes: { ok: boolean; status: number; body: unknown };
}): Promise<{
  handled: QueueResult | null;
  stampResult: ReturnType<typeof readStampOutcome>;
}> {
  const { admin, lease, row, nextAttempts, invRes } = params;
  const stampResult = readStampOutcome(invRes.status, invRes.body);
  const recoveryHandoff = stampResult?.kind === "recovery_required" &&
    stampResult.reference === "saved";
  const issued = stampResult?.kind === "issued" ||
    stampResult?.kind === "already_issued";

  if (issued || recoveryHandoff) {
    await markOwnedQueueRow(admin, lease, {
      status: "succeeded",
      attempts: nextAttempts,
      last_error: null,
      deferrals: 0,
    });
    return {
      handled: {
        id: row.id,
        status: recoveryHandoff ? "succeeded_recovery_handoff" : "succeeded",
        http: invRes.status,
      },
      stampResult,
    };
  }

  if (isUnconfirmedStampResponse(stampResult, invRes)) {
    const status = await deferStamp(
      admin,
      lease,
      row,
      "El timbrado aún no tiene un resultado confirmado.",
    );
    return {
      handled: { id: row.id, status, http: invRes.status },
      stampResult,
    };
  }

  return { handled: null, stampResult };
}
