/**
 * Bloque 3C: estados de factura EMITIDA (cuentan como facturación real).
 * `draft` es reanudable/editable; `void`/`cancelled` no cuentan.
 */
export const ISSUED_INVOICE_STATUSES = ["sent", "partial", "overdue", "paid"] as const;

export type IssuedInvoiceStatus = (typeof ISSUED_INVOICE_STATUSES)[number];

const ISSUED = new Set<string>(ISSUED_INVOICE_STATUSES);

export function isIssuedInvoiceStatus(status: string | null | undefined): boolean {
  return !!status && ISSUED.has(status);
}
