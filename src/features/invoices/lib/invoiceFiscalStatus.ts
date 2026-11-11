export const INVOICE_FISCAL_LABELS = {
  pending: "Sin timbrar",
  stamping: "Timbrando…",
  stamped: "Timbrada",
  error: "Error de timbrado",
  cancellation_pending: "Cancelación en proceso",
  cancelled: "Cancelada",
  unknown: "Estado sin confirmar",
} as const;

export type InvoiceFiscalStatus = keyof typeof INVOICE_FISCAL_LABELS;
export type InvoiceFiscalFilter = Exclude<InvoiceFiscalStatus, "unknown">;
export interface FiscalStatusFields {
  cfdiStatus?: string | null;
  cancellationStatus?: string | null;
}

export function invoiceFiscalStatus({ cfdiStatus, cancellationStatus }: FiscalStatusFields): InvoiceFiscalStatus {
  if (cfdiStatus === "cancelled" || cancellationStatus === "accepted") return "cancelled";
  if (cancellationStatus === "pending") return "cancellation_pending";
  if (cfdiStatus == null || cfdiStatus === "pending") return "pending";
  if (cfdiStatus === "stamping" || cfdiStatus === "stamped" || cfdiStatus === "error") return cfdiStatus;
  return "unknown";
}

interface FiscalQueryFilter {
  equals?: ["cfdi_status" | "cancellation_status", string];
  anyOf: string[];
}

/** Server-side counterpart of the precedence above, applied BEFORE pagination.
 * Null cancellation values remain eligible; neq/not.in alone would drop them.
 */
export function invoiceFiscalQueryFilter(status: InvoiceFiscalFilter): FiscalQueryFilter {
  if (status === "cancelled") return { anyOf: ["cfdi_status.eq.cancelled,cancellation_status.eq.accepted"] };
  if (status === "cancellation_pending") return {
    equals: ["cancellation_status", "pending"],
    anyOf: ["cfdi_status.is.null,cfdi_status.neq.cancelled"],
  };
  const noCancellation = "cancellation_status.is.null,cancellation_status.not.in.(accepted,pending)";
  if (status === "pending") return { anyOf: [noCancellation, "cfdi_status.is.null,cfdi_status.eq.pending"] };
  return { equals: ["cfdi_status", status], anyOf: [noCancellation] };
}
