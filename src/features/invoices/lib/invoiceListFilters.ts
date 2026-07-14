export type InvoiceStatusFilter = "all" | "draft" | "sent" | "partial" | "paid" | "overdue";

export const INVOICE_STATUS_FILTERS: readonly InvoiceStatusFilter[] = [
  "all",
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
];

export interface InvoiceListFilters extends Record<string, unknown> {
  search: string;
  status: InvoiceStatusFilter;
  from?: string;
  to?: string;
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeInvoiceStatusFilter(value: string | null | undefined): InvoiceStatusFilter {
  switch (value) {
    case "draft":
      return "draft";
    case "sent":
      return "sent";
    case "partial":
      return "partial";
    case "paid":
      return "paid";
    case "overdue":
      return "overdue";
    default:
      return "all";
  }
}

export function normalizeInvoiceSearch(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function normalizeInvoiceDateParam(value: string | null | undefined): string | undefined {
  if (!value || !ISO_DAY_RE.test(value)) return undefined;
  return value;
}

export function createInvoiceListFilters(input?: Partial<InvoiceListFilters>): InvoiceListFilters {
  const filters: InvoiceListFilters = {
    search: normalizeInvoiceSearch(input?.search),
    status: normalizeInvoiceStatusFilter(input?.status),
  };

  const from = normalizeInvoiceDateParam(input?.from);
  const to = normalizeInvoiceDateParam(input?.to);

  if (from) filters.from = from;
  if (to) filters.to = to;

  return filters;
}

export function sanitizeInvoiceSearchForQuery(value: string): string {
  return value.replace(/[%,()]/g, " ").trim();
}