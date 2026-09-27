import { applyDiscount, lineItemTotal, money, type LineItem } from "@/lib/domain/invoiceTotals";
import { generateLineItemsFromModel } from "@/lib/domain/rentalCalculation";

export interface QuotedRentalBooking {
  id: string;
  forklift_id: string;
  quote_id?: string | null;
  organization_id?: string | null;
  currency?: string | null;
  status?: string;
  start_date: string;
  end_date: string;
  recurring_billing?: boolean | null;
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
}

export interface RentalQuoteSource {
  id: string;
  organization_id?: string | null;
  currency?: string | null;
  line_items: unknown;
  rental_meta?: unknown;
  start_date?: string | null;
  end_date?: string | null;
}

export type QuotedRentalUnit = { id: string; equipment_model_id?: string | null };
type RentalMeta = {
  modelId: string; quantity: number;
  dailyRate: number; weeklyRate: number; monthlyRate: number;
  discount?: number;
};
type Group = { meta: RentalMeta; lines: LineItem[]; bookings: QuotedRentalBooking[] };
const RENTAL = / — Renta (mensual|semanal|diaria)/;
const REVIEW = "No se puede reconstruir con certeza el descuento pactado. Revisa la cotización y las reservas antes de facturar.";

export function hasQuotedDiscount(quote: RentalQuoteSource): boolean {
  return [quote.line_items, quote.rental_meta].some((rows) => Array.isArray(rows)
    && rows.some((row) => row && typeof row === "object" && Number(row.discount) > 0));
}

function rentalItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) throw new Error(REVIEW);
  return value.filter((item): item is LineItem =>
    !!item && typeof item === "object" && typeof item.description === "string" && RENTAL.test(item.description));
}

function readMeta(value: unknown): RentalMeta[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(REVIEW);
  return value.map((item) => {
    const valid = item && typeof item.modelId === "string" && Number.isInteger(item.quantity) && item.quantity > 0
      && [item.dailyRate, item.weeklyRate, item.monthlyRate].every((rate) => typeof rate === "number" && Number.isFinite(rate) && rate >= 0
        && money(rate).value === rate && Number.isSafeInteger(money(rate).intValue));
    if (!valid) throw new Error(REVIEW);
    return item as RentalMeta;
  });
}

function matches(booking: QuotedRentalBooking, meta: RentalMeta, units: QuotedRentalUnit[]): boolean {
  const unit = units.find((candidate) => candidate.id === booking.forklift_id);
  return unit?.equipment_model_id === meta.modelId
    && (meta.dailyRate === 0 || booking.daily_rate === meta.dailyRate)
    && (meta.weeklyRate === 0 || booking.weekly_rate === meta.weeklyRate)
    && (meta.monthlyRate === 0 || booking.monthly_rate === meta.monthlyRate);
}

function validDiscount(line: LineItem): boolean {
  if (line.discount == null) return true;
  return typeof line.discount === "number" && Number.isFinite(line.discount) && line.discount >= 0
    && (line.discount_type == null || line.discount_type === "%" || line.discount_type === "$")
    && (line.discount_type === "$" || line.discount <= 100);
}

function quoteGroups(quote: RentalQuoteSource, siblings: QuotedRentalBooking[], units: QuotedRentalUnit[]): Group[] {
  if (!quote.start_date || !quote.end_date) throw new Error(REVIEW);
  const source = rentalItems(quote.line_items);
  let offset = 0;
  const groups = readMeta(quote.rental_meta).map((meta) => {
    const expected = generateLineItemsFromModel("Equipo", meta.dailyRate, meta.weeklyRate, meta.monthlyRate,
      quote.start_date as string, quote.end_date as string, meta.quantity);
    const lines = source.slice(offset, offset + expected.length);
    offset += expected.length;
    if (expected.length === 0 || lines.length !== expected.length || expected.some((line, i) =>
      line.quantity !== lines[i].quantity || line.unit_price !== lines[i].unit_price || line.total !== lines[i].total
      || !validDiscount(lines[i]))) throw new Error(REVIEW);
    if ((meta.discount ?? 0) > 0 && !lines.some((line) => (line.discount ?? 0) > 0)) throw new Error(REVIEW);
    return { meta, lines, bookings: siblings.filter((booking) => matches(booking, meta, units)).sort((a, b) => a.id.localeCompare(b.id)) };
  });
  if (offset !== source.length || groups.some((group) => group.bookings.length !== group.meta.quantity)
    || siblings.some((booking) => groups.filter((group) => group.bookings.some((b) => b.id === booking.id)).length !== 1)) {
    throw new Error(REVIEW);
  }
  return groups;
}

/** Allocate each quoted discount once, including odd cents, in stable booking ID order. */
function selectedDiscount(line: LineItem, group: Group, selected: Set<string>): number {
  const cents = money(line.total).subtract(applyDiscount(line)).intValue;
  const base = Math.floor(cents / group.meta.quantity);
  const remainder = cents % group.meta.quantity;
  return group.bookings.reduce((sum, booking, index) =>
    sum + (selected.has(booking.id) ? base + (index < remainder ? 1 : 0) : 0), 0) / 100;
}

/** Reconstruct the original full-term rental agreement; extras do not belong to rental revenue. */
export function allocateQuotedRentalLines(
  quote: RentalQuoteSource, selected: QuotedRentalBooking[],
  allBookings: QuotedRentalBooking[], units: QuotedRentalUnit[],
): LineItem[] {
  const siblings = allBookings.filter((b) => b.quote_id === quote.id && b.status !== "cancelled");
  if (selected.length === 0 || selected.some((b) => b.quote_id !== quote.id
    || b.start_date !== quote.start_date || b.end_date !== quote.end_date
    || !siblings.some((candidate) => candidate.id === b.id && candidate.forklift_id === b.forklift_id)
    || (quote.currency && (b.currency ?? "MXN").toUpperCase() !== quote.currency.toUpperCase()))
    || (quote.organization_id && siblings.some((b) => b.organization_id !== quote.organization_id))) throw new Error(REVIEW);
  const selectedIds = new Set(selected.map((b) => b.id));
  if (selectedIds.size !== selected.length) throw new Error(REVIEW);
  const groups = quoteGroups(quote, siblings, units);
  if (selected.some((booking) => !groups.some((group) => group.bookings.some((b) => b.id === booking.id)
    && matches(booking, group.meta, units)))) throw new Error(REVIEW);
  const result: LineItem[] = [];
  for (const group of groups) {
    const count = group.bookings.filter((b) => selectedIds.has(b.id)).length;
    if (count === 0) continue;
    for (const line of group.lines) {
      const unitPrice = money(line.unit_price).divide(group.meta.quantity).multiply(count).value;
      result.push({ ...line,
        description: line.description.replace(`(x${group.meta.quantity})`, `(x${count})`),
        unit_price: unitPrice, total: lineItemTotal(line.quantity, unitPrice),
        discount: selectedDiscount(line, group, selectedIds), discount_type: "$",
      });
    }
  }
  return result;
}
