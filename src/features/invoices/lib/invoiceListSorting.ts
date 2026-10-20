/** Only sortable list columns may be sent to PostgREST. */
const INVOICE_SORT_COLUMNS = [
  "invoice_number", "customer_name", "total", "status", "issued_at", "due_date",
] as const;

type InvoiceSortColumn = typeof INVOICE_SORT_COLUMNS[number];
export type InvoiceListSorting = readonly { id: string; desc: boolean }[];

export function normalizeInvoiceListSorting(sorting: InvoiceListSorting) {
  const seen = new Set<string>();
  return sorting.filter((sort): sort is { id: InvoiceSortColumn; desc: boolean } => {
    if (!INVOICE_SORT_COLUMNS.includes(sort.id as InvoiceSortColumn) || seen.has(sort.id)) return false;
    seen.add(sort.id);
    return true;
  }).map(({ id, desc }) => ({ id, desc: !!desc }));
}
