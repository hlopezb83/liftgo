import { originalPeriodBooking, originalPeriodUnavailable, bookingPeriodConflict } from "../../lib/originalBookingPeriod";
import { useBookingBillingEvidence } from "../invoices/useBookingBillingEvidence";
import type { BillableBooking } from "../../lib/bookingCompatibility";
import type { BookingInvoiceClaim } from "../../lib/originalBookingPeriod";

interface ExistingPeriod {
  booking_id?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
}
interface Args<T extends BillableBooking> {
  bookings: T[] | undefined;
  isEdit: boolean;
  id?: string;
  extensionId: string | null;
  existing: ExistingPeriod | null | undefined;
  existingBookingIds: string[];
}

function evidenceError(claims: { isError: boolean }, extensions: { isError: boolean }, ready: boolean) {
  if (claims.isError || extensions.isError) return "No se pudo verificar el historial de facturación. Recarga y reintenta.";
  return ready ? null : "Espera a que cargue el historial de facturación de las reservas.";
}

function unavailable<T extends BillableBooking>(booking: T, args: Args<T>, claims: BookingInvoiceClaim[]) {
  const { isEdit, existing, existingBookingIds, id } = args;
  const linked = isEdit && (existing?.booking_id === booking.id || existingBookingIds.includes(booking.id));
  if (linked && !booking.recurring_billing && existing?.billing_period_start && existing.billing_period_end) {
    return bookingPeriodConflict(booking.id, existing.billing_period_start, existing.billing_period_end, claims, id);
  }
  return originalPeriodUnavailable(booking, claims, id);
}

function historyError(isEdit: boolean, extensionId: string | null, invalidHistory: boolean) {
  return !isEdit && !extensionId && invalidHistory
    ? "Hay reservas con historial de extensiones incompleto o incoherente. Revisa su historial antes de facturar el periodo original." : null;
}

/** Keep billing views distinct from operational booking dates. */
export function useInvoiceBookingPeriods<T extends BillableBooking>(args: Args<T>) {
  const { bookings, isEdit, extensionId } = args;
  const evidence = useBookingBillingEvidence();
  const ready = evidence.claims.isSuccess && evidence.extensions.isSuccess;
  const block = evidenceError(evidence.claims, evidence.extensions, ready);
  const originals = bookings?.flatMap((booking) => {
    const original = originalPeriodBooking(booking, evidence.extensions.data ?? []);
    return original ? [original] : [];
  });
  const billingBookings = isEdit || extensionId ? bookings : originals;
  const claims = evidence.claims.data ?? [];
  const unavailableIds = new Set(billingBookings?.filter((booking) => unavailable(booking, args, claims)).map((booking) => booking.id));
  const invalidHistory = originals?.length !== bookings?.length;
  const historyBlock = historyError(isEdit, extensionId, invalidHistory);
  return {
    billingBookings, claims, unavailableIds, ready, block, invalidHistory,
    handlerBookings: ready ? billingBookings : undefined,
    candidates: ready ? billingBookings : [],
    linkedBlock: (ids: string[] | undefined) => ids?.length ? block : null,
    availabilityBlock: block || historyBlock,
    isFetching: evidence.claims.isFetching || evidence.extensions.isFetching,
    refetch: () => Promise.all([evidence.claims.refetch(), evidence.extensions.refetch()]),
  };
}
