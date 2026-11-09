export type HistoricalInvoice = {
  id: string;
  invoice_number: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  status: string | null;
  cfdi_status: string | null;
  cfdi_uuid?: string | null;
  cancellation_status?: string | null;
  // Optional legacy input only; planning never reads invoice line-item payloads.
  line_items?: unknown;
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

export type InvoicePeriods =
  | ReadonlyArray<{ start: string; end: string }>
  | null;

/** Union actual inclusive calendar-day coverage; null means ambiguous history. */
export function mergedInvoicePeriods(
  invoices: HistoricalInvoice[],
): Array<{ start: string; end: string }> | null {
  const validDate = (value: string | null): value is string => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value;
  };
  if (
    invoices.some((invoice) =>
      !validDate(invoice.billing_period_start) ||
      !validDate(invoice.billing_period_end) ||
      invoice.billing_period_start! > invoice.billing_period_end!
    )
  ) return null;
  const sorted = invoices.map((invoice) => ({
    start: invoice.billing_period_start!,
    end: invoice.billing_period_end!,
  })).sort((a, b) => a.start.localeCompare(b.start));
  const merged: Array<{ start: string; end: string }> = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (
      previous &&
      Date.parse(`${interval.start}T00:00:00Z`) <=
        Date.parse(`${previous.end}T00:00:00Z`) + 86400000
    ) {
      if (interval.end > previous.end) previous.end = interval.end;
    } else merged.push({ ...interval });
  }
  return merged;
}

/** Unknown/partial legacy coverage is never treated as a free month. */
export function periodCoverage(
  invoices: HistoricalInvoice[],
  start: string,
  end: string,
): "covered" | "uncovered" | "legacy_period_review" | "period_overlap_review" {
  return periodCoverageFromIntervals(
    mergedInvoicePeriods(invoices),
    start,
    end,
  );
}

/** Reuse one validated union per booking; null still blocks ambiguous history. */
export function periodCoverageFromIntervals(
  merged: InvoicePeriods,
  start: string,
  end: string,
): ReturnType<typeof periodCoverage> {
  if (!merged) return "legacy_period_review";
  if (
    merged.some((interval) => interval.start <= start && interval.end >= end)
  ) return "covered";
  if (
    merged.some((interval) => interval.start <= end && interval.end >= start)
  ) return "period_overlap_review";
  return "uncovered";
}
