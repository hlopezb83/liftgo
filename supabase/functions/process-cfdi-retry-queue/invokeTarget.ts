import { nextRetryAt } from "../_shared/cfdiRetryQueue.ts";
import type { authenticateCronRequest } from "../_shared/cronAuth.ts";
import type { EdgeDiagnostics } from "../_shared/edgeDiagnostics.ts";
import type { lookupPacInvoice } from "../_shared/facturapi/invoiceRecovery.ts";
import type { OrgQueryClient } from "../_shared/orgContext.ts";
import type { getAdminClient } from "../_shared/supabaseClients.ts";
import {
  assertOwnedQueue,
  markOwnedQueueRow,
  type QueueLease,
  QueueMutationError,
} from "./queueLease.ts";

export type AdminClient = ReturnType<typeof getAdminClient>;

export interface QueueRow {
  id: string;
  organization_id: string;
  updated_at: string;
  operation: string;
  invoice_id: string;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown>;
  status: string;
  deferrals: number;
  last_error: string | null;
}

export interface QueueResult {
  id: string;
  status: string;
  http?: number;
}

export interface HandleRequestDeps {
  admin?: OrgQueryClient;
  env?: (key: string) => string | undefined;
  authenticate?: typeof authenticateCronRequest;
  lookup?: typeof lookupPacInvoice;
  fetch?: typeof fetch;
  diagnostics?: EdgeDiagnostics;
}

export const OPERATION_TO_FUNCTION: Record<string, string> = {
  stamp: "stamp-cfdi",
  cancel: "cancel-cfdi",
  cancel_nc: "cancel-credit-note",
  cancel_rep: "cancel-payment-complement",
};

export const MAX_DEFERRALS = 10;
export const CANCELLATION_IN_PROGRESS_CODE = "CANCELLATION_IN_PROGRESS";

export function is409Deferrable(operation: string, body: unknown): boolean {
  if (operation === "cancel_nc" || operation === "cancel_rep") return true;
  if (operation !== "cancel") return false;
  return (body as { code?: string } | null)?.code ===
    CANCELLATION_IN_PROGRESS_CODE;
}

function operationIdKey(operation: string): string {
  if (operation === "cancel_rep") return "payment_id";
  if (operation === "cancel_nc") return "credit_note_id";
  return "invoice_id";
}

export function operationTable(operation: string): string {
  if (operation === "cancel_rep") return "payments";
  if (operation === "cancel_nc") return "credit_notes";
  return "invoices";
}

export async function deferStamp(
  admin: OrgQueryClient,
  lease: QueueLease,
  row: QueueRow,
  reason: string,
): Promise<string> {
  const deferrals = (row.deferrals ?? 0) + 1;
  const exhausted = deferrals >= MAX_DEFERRALS;
  await markOwnedQueueRow(admin, lease, {
    status: exhausted ? "exhausted" : "pending",
    attempts: row.attempts,
    deferrals,
    last_error: reason,
    ...(exhausted
      ? {}
      : { next_retry_at: nextRetryAt(deferrals).toISOString() }),
  });
  return exhausted ? "exhausted" : "stamp_recovery_pending";
}

export async function invokeStampFn(params: {
  fnName: string;
  operation: string;
  invoiceId: string;
  serviceKey: string;
  projectRef: string;
  payload: Record<string, unknown>;
  fetchFn: typeof fetch;
  retryContext: { id: string; token: string };
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url =
    `https://${params.projectRef}.supabase.co/functions/v1/${params.fnName}`;
  const idKey = operationIdKey(params.operation);
  const bodyToSend: Record<string, unknown> = {
    ...(params.payload ?? {}),
    [idKey]: params.invoiceId,
    retry_queue: params.retryContext,
  };
  delete bodyToSend._fiscal_context;
  const res = await params.fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${params.serviceKey}`,
      "apikey": params.serviceKey,
    },
    body: JSON.stringify(bodyToSend),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch { /* text-only response */ }
  return { ok: res.ok, status: res.status, body };
}

export async function refreshCancellationBestEffort(params: {
  admin: AdminClient;
  lease: QueueLease;
  row: QueueRow;
  projectRef: string;
  serviceKey: string;
  fetchFn: typeof fetch;
}): Promise<void> {
  const { admin, lease, row, projectRef, serviceKey, fetchFn } = params;
  const idKey = operationIdKey(row.operation);
  try {
    await assertOwnedQueue(admin, lease);
    const refreshRes = await fetchFn(
      `https://${projectRef}.supabase.co/functions/v1/refresh-cancellation-status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "apikey": serviceKey,
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          [idKey]: row.invoice_id,
          retry_queue: { id: lease.id, token: lease.updatedAt },
        }),
      },
    );
    if (!refreshRes.ok) {
      console.warn(
        "[process-cfdi-retry-queue] refresh-cancellation-status failed",
        { row_id: row.id, status: refreshRes.status },
      );
    }
  } catch (refreshErr) {
    if (refreshErr instanceof QueueMutationError) throw refreshErr;
    console.warn(
      "[process-cfdi-retry-queue] refresh-cancellation-status threw",
      {
        row_id: row.id,
        error: refreshErr instanceof Error
          ? refreshErr.message
          : String(refreshErr),
      },
    );
  }
}

export async function isDocCancelled(
  admin: AdminClient,
  operation: string,
  docId: string,
  organizationId: string,
): Promise<boolean> {
  const isRep = operation === "cancel_rep";
  const table = operationTable(operation);
  const select = isRep
    ? "rep_cfdi_status, rep_cancellation_status"
    : "status, cfdi_status, cancellation_status";
  const { data, error } = await admin
    .from(table)
    .select(select)
    .eq("id", docId)
    .eq("organization_id", organizationId)
    .maybeSingle() as {
      data: Record<string, unknown> | null;
      error: { message?: string } | null;
    };
  if (error || !data) {
    if (error) {
      console.warn("[process-cfdi-retry-queue] doc read after refresh failed", {
        table,
        docId,
        error: error.message ?? String(error),
      });
    }
    return false;
  }
  if (isRep) {
    return data.rep_cfdi_status === "cancelled" ||
      data.rep_cancellation_status === "accepted";
  }
  return data.status === "cancelled" || data.cfdi_status === "cancelled" ||
    data.cancellation_status === "accepted";
}

export function resolveEnvConfig(envGet: (key: string) => string | undefined): {
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
