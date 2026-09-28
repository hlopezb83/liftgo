export type HistoricalInvoice = {
  id: string;
  invoice_number: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  status: string | null;
  cfdi_status: string | null;
  line_items: unknown;
};

/** A draft with no CFDI status still occupies its billing period. */
export function mergeLiveInvoiceHistory(
  linked: Array<{ invoices: HistoricalInvoice | null }>,
  direct: HistoricalInvoice[],
): HistoricalInvoice[] {
  const history = new Map<string, HistoricalInvoice>();
  for (const row of linked) {
    const invoice = row.invoices;
    if (
      invoice && invoice.status !== "cancelled" &&
      invoice.cfdi_status !== "cancelled"
    ) {
      history.set(invoice.id, invoice);
    }
  }
  for (const invoice of direct) {
    if (
      invoice.status !== "cancelled" && invoice.cfdi_status !== "cancelled"
    ) {
      history.set(invoice.id, invoice);
    }
  }
  return [...history.values()];
}
