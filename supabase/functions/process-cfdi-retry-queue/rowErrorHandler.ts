import { nextRetryAt } from "../_shared/cfdiRetryQueue.ts";
import { FiscalRetryContextError } from "../_shared/facturapi/retryContext.ts";
import { decideTerminalStatus } from "./decisions.ts";
import type { AdminClient, QueueResult, QueueRow } from "./invokeTarget.ts";
import {
  markOwnedQueueRow,
  type QueueLease,
  QueueMutationError,
} from "./queueLease.ts";
import { InvoiceRecoveryError } from "./recoveredInvoice.ts";

function queueWriteFailureResult(
  rowId: string,
  queueError: unknown,
): QueueResult {
  return {
    id: rowId,
    status: queueError instanceof QueueMutationError
      ? queueError.kind
      : "queue_write_error",
  };
}

export async function handleRowException(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  nextAttempts: number;
  nowIso: string;
  err: unknown;
}): Promise<QueueResult> {
  const { admin, lease, row, nextAttempts, nowIso, err } = params;

  if (err instanceof FiscalRetryContextError) {
    try {
      await markOwnedQueueRow(admin, lease, {
        status: err.kind === "unavailable" ? "pending" : "exhausted",
        attempts: row.attempts,
        last_error: err.message,
        next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
      });
      return { id: row.id, status: err.code };
    } catch (queueError) {
      return queueWriteFailureResult(row.id, queueError);
    }
  }

  if (err instanceof QueueMutationError) {
    return { id: row.id, status: err.kind };
  }

  if (err instanceof InvoiceRecoveryError) {
    try {
      await markOwnedQueueRow(admin, lease, {
        status: "pending",
        attempts: row.attempts,
        last_error:
          "La factura recuperada no se confirmó en BD; revisar antes de volver a timbrar.",
        next_retry_at: nextRetryAt(row.attempts + 1).toISOString(),
      });
      return { id: row.id, status: err.kind };
    } catch (queueError) {
      return queueWriteFailureResult(row.id, queueError);
    }
  }

  const msg = err instanceof Error ? err.message : String(err);
  const queueStatus = decideTerminalStatus(nextAttempts, row.max_attempts);
  try {
    await markOwnedQueueRow(admin, lease, {
      status: queueStatus,
      attempts: nextAttempts,
      last_error: msg.slice(0, 2000),
      next_retry_at: queueStatus === "exhausted"
        ? nowIso
        : nextRetryAt(nextAttempts).toISOString(),
    });
  } catch (queueError) {
    return queueWriteFailureResult(row.id, queueError);
  }
  return {
    id: row.id,
    status: queueStatus === "exhausted" ? "exhausted" : "retry",
  };
}
