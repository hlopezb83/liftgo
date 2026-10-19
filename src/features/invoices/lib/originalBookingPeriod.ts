import type { BillableBooking } from "./bookingCompatibility";

export interface BillingExtension {
  booking_id: string;
  original_end_date: string;
  new_end_date: string;
  invoice_id?: string | null;
  pending_invoice_id?: string | null;
}
export interface BookingInvoiceClaim {
  invoice_id: string;
  booking_id: string;
  status: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
}

/** Extension history, not invoice state, defines the original rental term.
 * A cancelled extension invoice does not undo the physical extension. */
export function originalPeriodBooking<T extends BillableBooking>(booking: T, extensions: BillingExtension[]): T | null {
  if (booking.recurring_billing) return booking;
  const history = extensions.filter((ext) => ext.booking_id === booking.id)
    .sort((a, b) => a.original_end_date.localeCompare(b.original_end_date));
  if (!history.length) return booking;
  let end = history[0].original_end_date;
  const originalEnd = end;
  for (const extension of history) {
    if (extension.original_end_date !== end || extension.original_end_date < booking.start_date
      || extension.original_end_date >= extension.new_end_date) return null;
    end = extension.new_end_date;
  }
  if (end !== booking.end_date) return null;
  return { ...booking, end_date: originalEnd };
}

/** Inclusive date ranges: sharing a day overlaps; adjacent days do not.
 * Legacy claims with missing/invalid dates are not evidence of availability. */
export function claimOverlapsPeriod(claim: BookingInvoiceClaim, start: string, end: string): boolean {
  const from = claim.billing_period_start;
  const to = claim.billing_period_end;
  return !from || !to || from > to || (from <= end && to >= start);
}

export function bookingPeriodConflict(
  bookingId: string, start: string, end: string,
  claims: BookingInvoiceClaim[], currentInvoiceId?: string,
): boolean {
  return claims.some((claim) => claim.booking_id === bookingId && claim.invoice_id !== currentInvoiceId
    && claim.status !== "cancelled" && claimOverlapsPeriod(claim, start, end));
}

export function originalPeriodUnavailable(
  booking: BillableBooking, claims: BookingInvoiceClaim[], currentInvoiceId?: string,
): boolean {
  // Preserve the existing recurring selector policy; the recurring engine owns cycles.
  if (booking.recurring_billing) return claims.some((claim) => claim.booking_id === booking.id
    && claim.invoice_id !== currentInvoiceId && claim.status !== "cancelled");
  return bookingPeriodConflict(booking.id, booking.start_date, booking.end_date, claims, currentInvoiceId);
}
