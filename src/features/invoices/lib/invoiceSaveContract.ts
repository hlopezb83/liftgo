import type { Json, Tables, TablesInsert } from "@/integrations/supabase/types";

export interface SaveInvoiceWithBookingsArgs {
  payload: Omit<TablesInsert<"invoices">, "invoice_number" | "organization_id">;
  bookingIds: string[];
  /** null/undefined creates; an id edits the existing invoice. */
  invoiceId?: string | null;
  /** Version read when the edit form opened. */
  expectedVersion?: number | null;
  /** Repaired damage linked inside the same database transaction. */
  damageId?: string | null;
}

/** Keep overload selection and null/default semantics at one transport boundary. */
export function buildInvoiceSaveRpcArgs({
  payload, bookingIds, invoiceId, expectedVersion, damageId,
}: SaveInvoiceWithBookingsArgs) {
  return {
    p_invoice: payload as unknown as Json,
    p_booking_ids: bookingIds,
    // PostgREST requires all five arguments to resolve the damage overload.
    p_invoice_id: damageId ? (invoiceId ?? null) : (invoiceId ?? undefined),
    p_expected_version: damageId ? (expectedVersion ?? null) : (expectedVersion ?? undefined),
    ...(damageId ? { p_damage_id: damageId } : {}),
  };
}

const confirmationError = () => new Error(
  "No se pudo confirmar el guardado de la factura. Revisa la lista de facturas antes de volver a intentar.",
);

/**
 * Validate the identity consumed by success/navigation callbacks, not every
 * invoice column. A malformed response does not prove the transaction rolled
 * back: do not retry the write or tell the operator that nothing was saved.
 */
export function readSavedInvoice(data: unknown, expectedId?: string | null): Tables<"invoices"> {
  if (Array.isArray(data) && data.length !== 1) throw confirmationError();
  const row: unknown = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || Array.isArray(row)) throw confirmationError();
  const record = row as Record<string, unknown>;
  if (
    typeof record.id !== "string" || !record.id.trim() ||
    typeof record.invoice_number !== "string" || !record.invoice_number.trim() ||
    (expectedId != null && record.id !== expectedId)
  ) throw confirmationError();
  // Remaining columns come from the existing RPC contract, without projection.
  return row as Tables<"invoices">;
}
