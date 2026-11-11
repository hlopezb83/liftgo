import { useMemo } from "react";
import { indexBillingEvidence, type BillingEvidenceIndex } from "../../lib/billingEvidenceIndex";
import { completedRecurringBooking } from "../../lib/completedRecurringBooking";
import { originalPeriodBooking, originalPeriodUnavailable, bookingPeriodConflict } from "../../lib/originalBookingPeriod";
import { useBookingBillingEvidence } from "../invoices/useBookingBillingEvidence";
import type { BillableBooking } from "../../lib/bookingCompatibility";
import type { ReturnBillingEvidence } from "../../lib/completedRecurringBooking";
import type { BillingExtension, BookingInvoiceClaim } from "../../lib/originalBookingPeriod";

const EMPTY_CLAIMS: BookingInvoiceClaim[] = [];
const EMPTY_EXTENSIONS: BillingExtension[] = [];
const EMPTY_RETURNS: ReturnBillingEvidence[] = [];
const EMPTY_BOOKING_IDS: string[] = [];

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

function unavailable<T extends BillableBooking>(booking: T, args: Pick<Args<T>, "isEdit" | "existing" | "existingBookingIds" | "id">, claims: BookingInvoiceClaim[]) {
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

function projectBookings<T extends BillableBooking>(
  bookings: T[] | undefined, isEdit: boolean, extensionId: string | null,
  index: BillingEvidenceIndex, returnsReady: boolean, latestReturnTime: number | null,
) {
  const errors = new Map<string, string>();
  if (isEdit || extensionId) return { billingBookings: bookings, errors, invalidHistory: false };
  const originals = bookings?.flatMap((booking) => {
    const original = originalPeriodBooking(booking, index.extensionsByBooking.get(booking.id) ?? EMPTY_EXTENSIONS);
    return original ? [original] : [];
  });
  const now = latestReturnTime === null ? new Date() : new Date(latestReturnTime);
  const billingBookings = originals?.flatMap((booking) => {
    if (booking.status === "completed" && booking.recurring_billing && !returnsReady) {
      errors.set(booking.id, `${booking.booking_number ?? booking.id}: no se pudo verificar la devolución efectiva. Espera o reintenta consultar su historial.`);
      return [];
    }
    const monthly = booking.monthly_rate ?? index.monthlyRateByForklift.get(booking.forklift_id ?? "");
    const result = completedRecurringBooking(booking, index.claimsByBooking.get(booking.id) ?? EMPTY_CLAIMS,
      index.returnsByBooking.get(booking.id) ?? EMPTY_RETURNS, now, monthly, index.claimsByInvoice);
    if (result.error) errors.set(booking.id, `${booking.booking_number ?? booking.id}: ${result.error}`);
    return result.booking ? [result.booking] : [];
  });
  return { billingBookings, errors, invalidHistory: originals?.length !== bookings?.length };
}

function latestPastReturnTime(times: number[]): number | null {
  const now = new Date().getTime();
  let latest: number | null = null;
  for (const time of times) {
    if (time <= now && (latest === null || time > latest)) latest = time;
  }
  return latest;
}

function selectedBlock(ids: string[] | undefined, block: string | null, errors: Map<string, string>) {
  if (!ids?.length) return null;
  return block || ids.map((id) => errors.get(id)).find(Boolean) || null;
}

/** Keep billing views distinct from operational booking dates. */
export function useInvoiceBookingPeriods<T extends BillableBooking>(args: Args<T>) {
  const { bookings, forklifts, isEdit, extensionId, id, existing } = args;
  const existingBookingIds = isEdit ? args.existingBookingIds : EMPTY_BOOKING_IDS;
  const bookingIds = useMemo(() => bookings?.map((booking) => booking.id) ?? EMPTY_BOOKING_IDS, [bookings]);
  const evidence = useBookingBillingEvidence(bookingIds);
  const ready = evidence.claims.isSuccess && evidence.extensions.isSuccess;
  const block = evidenceError(evidence.claims, evidence.extensions, ready);
  const claims = evidence.claims.data ?? EMPTY_CLAIMS;
  const extensions = evidence.extensions.data ?? EMPTY_EXTENSIONS;
  const returns = evidence.returns.data ?? EMPTY_RETURNS;
  const index = useMemo(() => indexBillingEvidence(claims, extensions, returns, forklifts), [claims, extensions, returns, forklifts]);
  // Crossing a return timestamp is the only clock change affecting this projection.
  const latestReturnTime = latestPastReturnTime(index.returnTimes);
  const returnsReady = evidence.returns.isSuccess;
  const { billingBookings, errors, invalidHistory } = useMemo(
    () => projectBookings(bookings, isEdit, extensionId, index, returnsReady, latestReturnTime),
    [bookings, isEdit, extensionId, index, returnsReady, latestReturnTime],
  );
  const unavailableIds = useMemo(() => new Set(billingBookings?.filter((booking) => unavailable(booking,
    { isEdit, id, existing, existingBookingIds }, index.claimsByBooking.get(booking.id) ?? EMPTY_CLAIMS))
    .map((booking) => booking.id)), [billingBookings, isEdit, id, existing, existingBookingIds, index]);
  const historyBlock = historyError(args.isEdit, args.extensionId, invalidHistory);
  return {
    billingBookings, claims, unavailableIds, ready, block, invalidHistory,
    handlerBookings: ready ? billingBookings : undefined,
    candidates: ready ? billingBookings : [],
    linkedBlock: (ids: string[] | undefined) => selectedBlock(ids, block, errors),
    availabilityBlock: block || historyBlock || [...errors.values()][0],
    isFetching: evidence.claims.isFetching || evidence.extensions.isFetching || evidence.returns.isFetching,
    refetch: () => Promise.all([
      evidence.claims.refetch({ cancelRefetch: false }),
      evidence.extensions.refetch({ cancelRefetch: false }),
      evidence.returns.refetch({ cancelRefetch: false }),
    ]),
  };
}
