import { bookingClaimOccupiesPeriod, type BookingInvoiceClaim } from "./originalBookingPeriod";
import type { BillableBooking } from "./bookingCompatibility";

interface RecurringPeriod { start: string; end: string }
export interface PendingRecurringPeriod { period: RecurringPeriod | null; error: string | null }
const MAX_MONTHS = 1200;
const invalidHistory = "No se pudo verificar el historial completo de periodos recurrentes. Revisa las fechas antes de facturar.";

function validDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Inclusive month from start, clamping the next anniversary to its month. */
export function anniversaryCycleEnd(start: string): string {
  const date = new Date(`${start}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(date.getTime());
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function anniversaryCycleDays(start: string, end: string) {
  const inclusiveDays = (to: string) => Math.round((Date.parse(to) - Date.parse(start)) / 86400000) + 1;
  return { start, billedDays: inclusiveDays(end), daysInMonth: inclusiveDays(anniversaryCycleEnd(start)) };
}
function monthEnd(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

interface ClaimedPeriod extends RecurringPeriod { claim: BookingInvoiceClaim }
function activeRanges(bookingId: string, claims: BookingInvoiceClaim[]): ClaimedPeriod[] | null {
  const ranges: ClaimedPeriod[] = [];
  for (const claim of claims) {
    if (claim.booking_id !== bookingId || !bookingClaimOccupiesPeriod(claim)) continue;
    const { billing_period_start: start, billing_period_end: end } = claim;
    if (!validDate(start) || !validDate(end) || start > end) return null;
    ranges.push({ start, end, claim });
  }
  return ranges.sort((a, b) => a.start.localeCompare(b.start));
}

/** Manual continuation only: never use a max billed date that skips a gap.
 * Unknown history or a future claim inside the proposed month fails closed. */
export function pendingActiveRecurringPeriod(
  booking: Pick<BillableBooking, "id" | "start_date" | "end_date">,
  claims: BookingInvoiceClaim[],
): PendingRecurringPeriod {
  if (!validDate(booking.start_date) || !validDate(booking.end_date) || booking.start_date > booking.end_date) {
    return { period: null, error: invalidHistory };
  }
  const ranges = activeRanges(booking.id, claims);
  if (!ranges) return { period: null, error: invalidHistory };
  let start = booking.start_date;
  for (const range of ranges) {
    if (range.start > start) break;
    if (range.end >= start) start = nextDay(range.end);
  }
  if (start > booking.end_date) return { period: null, error: null };
  const monthlyEnd = anniversaryCycleEnd(start);
  const end = monthlyEnd < booking.end_date ? monthlyEnd : booking.end_date;
  if (ranges.some((range) => range.start <= end && range.end >= start)) {
    return { period: null, error: "El siguiente ciclo tiene días ya facturados. Revisa sus facturas antes de continuar para evitar cobros duplicados." };
  }
  return { period: { start, end }, error: null };
}
function fullyCovered(start: string, end: string, ranges: RecurringPeriod[]): boolean {
  let cursor = start;
  for (const range of ranges) {
    if (range.start > cursor) return false;
    if (range.end >= end) return true;
    if (range.end >= cursor) cursor = nextDay(range.end);
  }
  return false;
}

function uncoveredFragment(start: string, end: string, ranges: RecurringPeriod[]): RecurringPeriod {
  let cursor = start;
  for (const range of ranges) {
    if (range.start > cursor) {
      const previous = new Date(`${range.start}T00:00:00Z`);
      previous.setUTCDate(previous.getUTCDate() - 1);
      return { start: cursor, end: previous.toISOString().slice(0, 10) };
    }
    if (range.end >= cursor) cursor = nextDay(range.end);
  }
  return { start: cursor, end };
}

function partialPeriod(start: string, end: string, overlaps: ClaimedPeriod[], verify?: (claim: BookingInvoiceClaim) => boolean): PendingRecurringPeriod {
  if (!verify || !overlaps.every((range) => verify(range.claim))) {
    return { period: null, error: "Este ciclo recurrente tiene facturación parcial. Revisa sus facturas antes de cobrar el saldo pendiente." };
  }
  return { period: uncoveredFragment(start, end, overlaps), error: null };
}

/** Calendar cycles, earliest first, against ALL active direct/pivot claims.
 * The caller supplies the verified billable cutoff; no operational dates change.
 * Partial coverage is subtracted only after monetary/attribution verification;
 * otherwise it needs review. Cancelled invoices alone release their periods. */
export function pendingRecurringPeriod(
  booking: Pick<BillableBooking, "id" | "start_date" | "end_date">,
  claims: BookingInvoiceClaim[], billableThrough: string,
  verifyPartialClaim?: (claim: BookingInvoiceClaim) => boolean,
): PendingRecurringPeriod {
  if (!validDate(booking.start_date) || !validDate(booking.end_date) || !validDate(billableThrough)
    || booking.start_date > booking.end_date || billableThrough < booking.start_date) {
    return { period: null, error: invalidHistory };
  }
  const end = billableThrough;
  const ranges = activeRanges(booking.id, claims);
  if (!ranges) return { period: null, error: invalidHistory };
  let start = booking.start_date;
  for (let month = 0; month < MAX_MONTHS && start <= end; month++) {
    const calendarEnd = monthEnd(start);
    const cycleEnd = calendarEnd < end ? calendarEnd : end;
    const overlaps = ranges.filter((range) => range.start <= cycleEnd && range.end >= start);
    if (!overlaps.length) return { period: { start, end: cycleEnd }, error: null };
    if (!fullyCovered(start, cycleEnd, overlaps)) return partialPeriod(start, cycleEnd, overlaps, verifyPartialClaim);
    start = nextDay(cycleEnd);
  }
  return { period: null, error: start > end ? null : invalidHistory };
}
