import { formatMtyDate } from "@/lib/utils";
import { pendingRecurringPeriod } from "./pendingRecurringPeriod";
import { verifiedRecurringCoverage } from "./verifiedRecurringCoverage";
import type { BillableBooking } from "./bookingCompatibility";
import type { BookingInvoiceClaim } from "./originalBookingPeriod";

export interface ReturnBillingEvidence { booking_id: string; forklift_id: string; inspected_at: string }
const returnError = "No se pudo verificar la devolución efectiva de una reserva recurrente. Revisa su inspección de devolución antes de facturar.";

const lateHistoryError = "Hay días posteriores al contrato pendientes de revisión: sus facturas históricas contienen cargos o partidas sin atribución inequívoca al equipo. Concilia esos cargos antes de facturar la renta tardía; no se consideran pagados.";

function unambiguousRentalHistory(bookingId: string, claims: BookingInvoiceClaim[]): boolean {
  const active = claims.filter((claim) => claim.status !== "cancelled");
  return active.filter((claim) => claim.booking_id === bookingId).every((claim) => {
    if (active.some((other) => other.invoice_id === claim.invoice_id && other.booking_id !== bookingId)) return false;
    return Array.isArray(claim.line_items) && claim.line_items.length > 0
      && claim.line_items.every((line: unknown) => typeof line === "object" && line !== null && "line_kind" in line && line.line_kind === "rental");
  });
}

function verifiedReturn(booking: BillableBooking, returns: ReturnBillingEvidence[], now: Date): ReturnBillingEvidence | null {
  const matching = returns.filter((row) => row.booking_id === booking.id);
  const row = matching[0];
  if (matching.length !== 1 || !row || row.forklift_id !== booking.forklift_id
    || !Number.isFinite(Date.parse(row.inspected_at)) || Date.parse(row.inspected_at) > now.getTime()) return null;
  return row;
}

/** A booking represents one unit; never borrow another unit's return date. */
export function completedRecurringBooking<T extends BillableBooking>(
  booking: T, claims: BookingInvoiceClaim[], returns: ReturnBillingEvidence[], now = new Date(), monthlyRate = booking.monthly_rate,
): { booking: T | null; error: string | null } {
  if (booking.status !== "completed" || !booking.recurring_billing) return { booking, error: null };
  const row = verifiedReturn(booking, returns, now);
  if (!row) return { booking: null, error: returnError };
  const cutoff = formatMtyDate(row.inspected_at, "yyyy-MM-dd");
  if (cutoff < booking.start_date) return { booking: null, error: returnError };
  const ambiguousLate = cutoff > booking.end_date && !unambiguousRentalHistory(booking.id, claims);
  const pending = pendingRecurringPeriod(booking, claims, ambiguousLate ? booking.end_date : cutoff,
    (claim) => verifiedRecurringCoverage(booking, claim, claims, monthlyRate));
  if (ambiguousLate && !pending.period) return { booking: null, error: pending.error || lateHistoryError };
  return { booking: pending.period ? { ...booking, pending_billing_period: pending.period } : null, error: pending.error };
}
