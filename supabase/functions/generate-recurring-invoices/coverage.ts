import {
  dateOnlyToMty,
  lastOfMonth,
  MAX_CATCHUP_ITERATIONS,
  toIsoDate,
} from "./periods.ts";
import {
  type HistoricalInvoice,
  mergedInvoicePeriods,
} from "./invoiceHistory.ts";

function validDate(value: string): Date {
  const date = dateOnlyToMty(value);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) ||
    toIsoDate(date) !== value
  ) {
    throw new Error("La reserva contiene fechas de facturación inválidas");
  }
  return date;
}
const ordinal = (date: Date) => date.getUTCFullYear() * 12 + date.getUTCMonth();
const monthDate = (month: number) =>
  new Date(Date.UTC(Math.floor(month / 12), month % 12, 1));

/**
 * Subtract merged, completely covered month intervals in O(history log history).
 * Enumerate at most 24 remaining canonical months, including review rows.
 * A centuries-old contract never requires a month-by-month historical sweep.
 */
export function pendingCanonicalPeriods(
  startDate: string,
  endDate: string | null | undefined,
  limit: Date,
  invoices: HistoricalInvoice[],
): { starts: string[]; pendingCount: number } {
  const start = validDate(startDate);
  const end = endDate ? validDate(endDate) : null;
  const last = end && end < limit ? end : limit;
  if (start > last) return { starts: [], pendingCount: 0 };
  const firstMonth = ordinal(start);
  const lastMonth = ordinal(last);
  const canonicalStart = (month: number) =>
    month === firstMonth ? startDate : toIsoDate(monthDate(month));
  const canonicalEnd = (month: number) =>
    end && ordinal(end) === month
      ? endDate!
      : toIsoDate(lastOfMonth(monthDate(month)));
  // Undated/invalid live history blocks the whole booking. One review row is
  // sufficient, and no guessed cursor or pending count is returned.
  const dailyCoverage = mergedInvoicePeriods(invoices);
  if (!dailyCoverage) return { starts: [startDate], pendingCount: 0 };
  const covered: Array<[number, number]> = [];
  for (const interval of dailyCoverage) {
    const invoiceStart = interval.start;
    const invoiceEnd = interval.end;
    let lo = ordinal(validDate(invoiceStart));
    let hi = ordinal(validDate(invoiceEnd));
    if (invoiceStart > canonicalStart(lo)) lo++;
    if (invoiceEnd < canonicalEnd(hi)) hi--;
    lo = Math.max(lo, firstMonth);
    hi = Math.min(hi, lastMonth);
    if (lo <= hi) covered.push([lo, hi]);
  }
  covered.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of covered) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1] + 1) {
      previous[1] = Math.max(previous[1], interval[1]);
    } else merged.push([...interval]);
  }
  const starts: string[] = [];
  let totalPending = 0;
  let cursor = firstMonth;
  const gap = (lo: number, hi: number) => {
    if (lo > hi) return;
    totalPending += hi - lo + 1;
    for (
      let month = lo;
      month <= hi && starts.length < MAX_CATCHUP_ITERATIONS;
      month++
    ) starts.push(canonicalStart(month));
  };
  for (const [lo, hi] of merged) {
    gap(cursor, lo - 1);
    cursor = hi + 1;
  }
  gap(cursor, lastMonth);
  return { starts, pendingCount: Math.max(0, totalPending - starts.length) };
}
