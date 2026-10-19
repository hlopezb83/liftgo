export type HistoricalInvoice = {
  id: string;
  invoice_number: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  status: string | null;
  cfdi_status: string | null;
  cfdi_uuid?: string | null;
  cancellation_status?: string | null;
  line_items: unknown;
};

/** Pending fiscal cancellation/stamping continues to occupy its period. */
function isActive(invoice: HistoricalInvoice): boolean {
  if (invoice.cfdi_status === "stamping") return true;
  if (invoice.cfdi_status === "stamped" || invoice.cfdi_uuid) {
    return invoice.cancellation_status !== "accepted";
  }
  return invoice.status !== "cancelled" && invoice.cfdi_status !== "cancelled";
}

/** A draft with no CFDI status still occupies its billing period. */
export function mergeLiveInvoiceHistory(
  linked: Array<{ invoices: HistoricalInvoice | null }>,
  direct: HistoricalInvoice[],
): HistoricalInvoice[] {
  const history = new Map<string, HistoricalInvoice>();
  for (const row of linked) {
    const invoice = row.invoices;
    if (
      invoice && isActive(invoice)
    ) {
      history.set(invoice.id, invoice);
    }
  }
  for (const invoice of direct) {
    if (
      isActive(invoice)
    ) {
      history.set(invoice.id, invoice);
    }
  }
  return [...history.values()];
}
