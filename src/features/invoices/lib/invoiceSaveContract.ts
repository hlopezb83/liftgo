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
  extensionId?: string | null;
  acceptQuoteId?: string | null;
  quoteExpectedVersion?: number | null;
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

/** Source links belong to the same transaction; never fall back to separate writes. */
export function buildInvoiceSaveRequest(args: SaveInvoiceWithBookingsArgs) {
  if (!args.extensionId && !args.acceptQuoteId) {
    return { name: "save_invoice_with_bookings" as const, args: buildInvoiceSaveRpcArgs(args) };
  }
  return { name: "save_invoice_with_sources" as const, args: {
    p_invoice: args.payload as unknown as Json,
    p_booking_ids: args.bookingIds,
    p_invoice_id: args.invoiceId ?? null,
    p_expected_version: args.expectedVersion ?? null,
    p_damage_id: args.damageId ?? null,
    p_extension_id: args.extensionId ?? null,
    p_accept_quote_id: args.acceptQuoteId ?? null,
    p_quote_expected_version: args.quoteExpectedVersion ?? null,
  } };
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
