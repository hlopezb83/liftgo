import { extensionBillableRange } from "@/features/bookings";
import { generateLineItemsFromModel, type LineItem } from "@/lib/domain/invoiceHelpers";
import { applyDiscount, lineItemTotal, money } from "@/lib/domain/invoiceTotals";
import type { LineItemValues } from "./invoiceFormSchema";

export interface QuotedBooking {
  id: string;
  forklift_id: string;
  quote_id?: string | null;
  status?: string;
  start_date: string;
  end_date: string;
  recurring_billing?: boolean | null;
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
}

export interface BookingQuoteSource {
  id: string;
  line_items: unknown;
  rental_meta?: unknown;
  start_date?: string | null;
  end_date?: string | null;
}

type Unit = { id: string; equipment_model_id?: string | null };
type RentalMeta = {
  modelId: string; quantity: number;
  dailyRate: number; weeklyRate: number; monthlyRate: number;
  discount?: number;
};
type Group = { meta: RentalMeta; lines: LineItem[]; bookings: QuotedBooking[] };
const RENTAL = / — Renta (mensual|semanal|diaria)/;
const REVIEW = "No se puede reconstruir con certeza el descuento pactado. Revisa la cotización y las reservas antes de facturar.";

function rentalItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LineItem =>
    !!item && typeof item === "object" && typeof item.description === "string" && RENTAL.test(item.description));
}

function hasSourceDiscount(quote: BookingQuoteSource): boolean {
  return [quote.line_items, quote.rental_meta].some((rows) => Array.isArray(rows)
    && rows.some((row) => row && typeof row === "object" && Number(row.discount) > 0));
}

interface BillingExtensionContext {
  requestedId: string | null | undefined;
  loaded: {
    id: string;
    booking_id: string;
    original_end_date: string;
    new_end_date: string;
    invoice_id?: string | null;
    bookings: { id: string } | null;
  } | null | undefined;
}

/** New extension days do not reuse the original quote's discounted period. */
function isVerifiedExtensionPeriod(
  selected: QuotedBooking[], periodStart: string | null | undefined,
  periodEnd: string | null | undefined, context?: BillingExtensionContext,
): boolean {
  const extension = context?.loaded;
  if (!extension || !context?.requestedId || extension.id !== context.requestedId || extension.invoice_id) return false;
  if (selected.length !== 1 || selected[0].id !== extension.booking_id
    || extension.bookings?.id !== extension.booking_id) return false;
  const range = extensionBillableRange(extension.original_end_date, extension.new_end_date);
  return !!range && range.start === periodStart && range.end === periodEnd;
}

export function quotedBillingPeriodError(
  selected: QuotedBooking[], quotes: BookingQuoteSource[] | undefined,
  periodStart: string | null | undefined, periodEnd: string | null | undefined,
  extensionContext?: BillingExtensionContext,
): string | null {
  if (isVerifiedExtensionPeriod(selected, periodStart, periodEnd, extensionContext)) return null;
  for (const booking of selected) {
    if (!booking.quote_id) continue;
    const quote = quotes?.find((source) => source.id === booking.quote_id);
    if (!quote) return "Espera a que cargue la cotización de origen antes de guardar.";
    if (!hasSourceDiscount(quote)) continue;
    if (periodStart !== quote.start_date || periodEnd !== quote.end_date) {
      return "Las partidas con descuento corresponden al periodo completo de la cotización. Conserva ese periodo; un periodo parcial requiere revisar y distribuir el descuento antes de facturar.";
    }
  }
  return null;
}

function readMeta(value: unknown): RentalMeta[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(REVIEW);
  return value.map((item) => {
    const valid = item && typeof item.modelId === "string" && Number.isInteger(item.quantity) && item.quantity > 0
      && [item.dailyRate, item.weeklyRate, item.monthlyRate].every((rate) => typeof rate === "number" && Number.isFinite(rate) && rate >= 0);
    if (!valid) throw new Error(REVIEW);
    return item as RentalMeta;
  });
}

function matches(booking: QuotedBooking, meta: RentalMeta, units: Unit[]): boolean {
  const unit = units.find((candidate) => candidate.id === booking.forklift_id);
  return unit?.equipment_model_id === meta.modelId
    && (meta.dailyRate === 0 || booking.daily_rate === meta.dailyRate)
    && (meta.weeklyRate === 0 || booking.weekly_rate === meta.weeklyRate)
    && (meta.monthlyRate === 0 || booking.monthly_rate === meta.monthlyRate);
}

function quoteGroups(quote: BookingQuoteSource, siblings: QuotedBooking[], units: Unit[]): Group[] {
  if (!quote.start_date || !quote.end_date) throw new Error(REVIEW);
  const source = rentalItems(quote.line_items);
  let offset = 0;
  const groups = readMeta(quote.rental_meta).map((meta) => {
    const expected = generateLineItemsFromModel("Equipo", meta.dailyRate, meta.weeklyRate, meta.monthlyRate,
      quote.start_date as string, quote.end_date as string, meta.quantity);
    const lines = source.slice(offset, offset + expected.length);
    offset += expected.length;
    if (lines.length !== expected.length || expected.some((line, i) =>
      line.quantity !== lines[i].quantity || line.unit_price !== lines[i].unit_price || line.total !== lines[i].total)) {
      throw new Error(REVIEW);
    }
    if ((meta.discount ?? 0) > 0 && !lines.some((line) => (line.discount ?? 0) > 0)) throw new Error(REVIEW);
    return { meta, lines, bookings: siblings.filter((booking) => matches(booking, meta, units)).sort((a, b) => a.id.localeCompare(b.id)) };
  });
  if (offset !== source.length || groups.some((group) => group.bookings.length !== group.meta.quantity)
    || siblings.some((booking) => groups.filter((group) => group.bookings.some((b) => b.id === booking.id)).length !== 1)) {
    throw new Error(REVIEW);
  }
  return groups;
}

/** Allocate the original discount in cents, once per quoted unit, including odd-cent remainders. */
function selectedDiscount(line: LineItem, group: Group, selected: Set<string>): number {
  const cents = money(line.total).subtract(applyDiscount(line)).intValue;
  const base = Math.floor(cents / group.meta.quantity);
  const remainder = cents % group.meta.quantity;
  return money(group.bookings.reduce((sum, booking, index) =>
    sum + (selected.has(booking.id) ? base + (index < remainder ? 1 : 0) : 0), 0)).divide(100).value;
}

/**
 * Preserve the accepted quote's grouped lines for its original full term.
 * Keeping groups avoids rounding the same percentage separately per forklift.
 * Ambiguous historical mappings or different periods require explicit review;
 * silently falling back to undiscounted catalog rates would overcharge.
 */
export function buildQuotedBookingLines(
  selected: QuotedBooking[], allBookings: QuotedBooking[], units: Unit[],
  quotes: BookingQuoteSource[] | undefined, fallback: (booking: QuotedBooking) => LineItemValues[],
): LineItemValues[] {
  const result: LineItemValues[] = [];
  const seen = new Set<string>();
  for (const booking of selected) {
    if (!booking.quote_id) { result.push(...fallback(booking)); continue; }
    if (seen.has(booking.quote_id)) continue;
    seen.add(booking.quote_id);
    const quote = quotes?.find((q) => q.id === booking.quote_id);
    if (!quote) throw new Error("Espera a que cargue la cotización de origen y vuelve a seleccionar las reservas.");
    const chosen = selected.filter((b) => b.quote_id === quote.id);
    if (!hasSourceDiscount(quote)) {
      result.push(...chosen.flatMap(fallback));
      continue;
    }
    if (chosen.some((b) => b.recurring_billing || b.start_date !== quote.start_date || b.end_date !== quote.end_date)) {
      throw new Error("Esta cotización tiene descuentos y un periodo recurrente o modificado. Revisa las partidas del periodo en una factura manual; no se precargarán tarifas sin descuento.");
    }
    const siblings = allBookings.filter((b) => b.quote_id === quote.id && b.status !== "cancelled");
    const selectedIds = new Set(chosen.map((b) => b.id));
    for (const group of quoteGroups(quote, siblings, units)) {
      const count = group.bookings.filter((b) => selectedIds.has(b.id)).length;
      if (count === 0) continue;
      for (const line of group.lines) {
        const unitPrice = money(line.unit_price).divide(group.meta.quantity).multiply(count).value;
        result.push({ ...line,
          description: line.description.replace(`(x${group.meta.quantity})`, `(x${count})`),
          unit_price: unitPrice, total: lineItemTotal(line.quantity, unitPrice),
          discount: selectedDiscount(line, group, selectedIds), discount_type: "$",
          clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
        });
      }
    }
  }
  return result;
}
