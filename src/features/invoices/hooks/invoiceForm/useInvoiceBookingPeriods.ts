import { completedRecurringBooking } from "../../lib/completedRecurringBooking";
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
  forklifts?: { id: string; monthly_rate?: number | null }[];
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

function projectBookings<T extends BillableBooking>(args: Args<T>, evidence: ReturnType<typeof useBookingBillingEvidence>) {
  const claims = evidence.claims.data ?? [];
  const errors = new Map<string, string>();
  const originals = args.bookings?.flatMap((booking) => {
    const original = originalPeriodBooking(booking, evidence.extensions.data ?? []);
    return original ? [original] : [];
  });
  if (args.isEdit || args.extensionId) return { billingBookings: args.bookings, errors, invalidHistory: false };
  const billingBookings = originals?.flatMap((booking) => {
    if (booking.status === "completed" && booking.recurring_billing && !evidence.returns.isSuccess) {
      errors.set(booking.id, `${booking.booking_number ?? booking.id}: no se pudo verificar la devolución efectiva. Espera o reintenta consultar su historial.`);
      return [];
    }
    const monthly = booking.monthly_rate ?? args.forklifts?.find((forklift) => forklift.id === booking.forklift_id)?.monthly_rate;
    const result = completedRecurringBooking(booking, claims, evidence.returns.data ?? [], new Date(), monthly);
    if (result.error) errors.set(booking.id, `${booking.booking_number ?? booking.id}: ${result.error}`);
    return result.booking ? [result.booking] : [];
  });
  return { billingBookings, errors, invalidHistory: originals?.length !== args.bookings?.length };
}

function selectedBlock(ids: string[] | undefined, block: string | null, errors: Map<string, string>) {
  if (!ids?.length) return null;
  return block || ids.map((id) => errors.get(id)).find(Boolean) || null;
}

/** Keep billing views distinct from operational booking dates. */
export function useInvoiceBookingPeriods<T extends BillableBooking>(args: Args<T>) {
  const evidence = useBookingBillingEvidence();
  const ready = evidence.claims.isSuccess && evidence.extensions.isSuccess;
  const block = evidenceError(evidence.claims, evidence.extensions, ready);
  const { billingBookings, errors, invalidHistory } = projectBookings(args, evidence);
  const claims = evidence.claims.data ?? [];
  const unavailableIds = new Set(billingBookings?.filter((booking) => unavailable(booking, args, claims)).map((booking) => booking.id));
  const historyBlock = historyError(args.isEdit, args.extensionId, invalidHistory);
  return {
    billingBookings, claims, unavailableIds, ready, block, invalidHistory,
    handlerBookings: ready ? billingBookings : undefined,
    candidates: ready ? billingBookings : [],
    linkedBlock: (ids: string[] | undefined) => selectedBlock(ids, block, errors),
    availabilityBlock: block || historyBlock || [...errors.values()][0],
    isFetching: evidence.claims.isFetching || evidence.extensions.isFetching || evidence.returns.isFetching,
    refetch: () => Promise.all([evidence.claims.refetch(), evidence.extensions.refetch(), evidence.returns.refetch()]),
  };
}
