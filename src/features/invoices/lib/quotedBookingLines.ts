import { extensionBillableRange } from "@/features/bookings";
import { allocateQuotedRentalLines, hasQuotedDiscount, type QuotedRentalBooking, type RentalQuoteSource, type QuotedRentalUnit } from "@/features/quotes";
import type { LineItemValues } from "./invoiceFormSchema";

export type QuotedBooking = QuotedRentalBooking;
export type BookingQuoteSource = RentalQuoteSource;
type Unit = QuotedRentalUnit;

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
    if (!hasQuotedDiscount(quote)) continue;
    if (periodStart !== quote.start_date || periodEnd !== quote.end_date) {
      return "Las partidas con descuento corresponden al periodo completo de la cotización. Conserva ese periodo; un periodo parcial requiere revisar y distribuir el descuento antes de facturar.";
    }
  }
  return null;
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
    if (!hasQuotedDiscount(quote)) {
      result.push(...chosen.flatMap(fallback));
      continue;
    }
    if (chosen.some((b) => b.recurring_billing || b.start_date !== quote.start_date || b.end_date !== quote.end_date)) {
      throw new Error("Esta cotización tiene descuentos y un periodo recurrente o modificado. Revisa las partidas del periodo en una factura manual; no se precargarán tarifas sin descuento.");
    }
    result.push(...allocateQuotedRentalLines(quote, chosen, allBookings, units).map((line) => ({
      ...line, clave_prod_serv: "78181500", clave_unidad: "DAY", objeto_imp: "02",
    })));
  }
  return result;
}
