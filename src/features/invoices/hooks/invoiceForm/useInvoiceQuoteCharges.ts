import { useWatch } from "react-hook-form";
import { CHARGE_AVAILABILITY_UNAVAILABLE, collectInvoiceChargeQuoteIds, quoteChargeSelectionError } from "../../lib/quoteChargeAvailability";
import { useQuoteChargeAvailability } from "../invoices/useQuoteChargeAvailability";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

type BookingSource = { id: string; quote_id?: string | null };
type BookingPivot = { booking_id: string; bookings: Record<string, unknown> | null };
type ExistingSource = { booking_id?: string | null; quote_id?: string | null; line_items?: unknown };
interface Props {
  form: UseFormReturn<InvoiceFormValues>;
  bookings: BookingSource[] | undefined;
  invoiceBookingsRows: BookingPivot[] | undefined;
  existing: ExistingSource | null | undefined;
  fromQuoteId: string | null;
  currentInvoiceId?: string;
}

function invoiceSourceLines(existing: ExistingSource | null | undefined): { source_quote_id?: string }[] {
  return Array.isArray(existing?.line_items) ? existing.line_items : [];
}

function linkedBookingIds(selectedIds: string[] | undefined, existing: ExistingSource | null | undefined, rows: BookingPivot[] | undefined) {
  return [...new Set([
    ...(selectedIds ?? []),
    ...(rows ?? []).map((row) => row.booking_id),
    ...(existing?.booking_id ? [existing.booking_id] : []),
  ])];
}

function quoteScopeBookings(bookings: BookingSource[] | undefined, rows: BookingPivot[] | undefined): BookingSource[] {
  return [
    ...(bookings ?? []),
    ...(rows ?? []).flatMap((row) => row.bookings && Object.hasOwn(row.bookings, "quote_id") ? [{
      id: row.booking_id,
      quote_id: typeof row.bookings.quote_id === "string" ? row.bookings.quote_id : null,
    }] : []),
  ];
}

function bookingScopeError(props: Props, ids: string[], scope: BookingSource[]): string | null {
  const missingPivots = !!props.currentInvoiceId && !!props.existing && !props.invoiceBookingsRows;
  const missingBooking = ids.some((id) => !scope.some((booking) => booking.id === id));
  return missingPivots || missingBooking
    ? "No se pudo verificar la cotización de todas las reservas vinculadas. Recarga las reservas y sus vínculos antes de guardar." : null;
}

function availabilityError(
  ids: string[], lines: InvoiceFormValues["lineItems"], availability: ReturnType<typeof useQuoteChargeAvailability>,
): string | null {
  if (ids.length === 0) return null;
  if (availability.isError) return CHARGE_AVAILABILITY_UNAVAILABLE;
  if (!availability.data) return "Verificando los cargos de la cotización…";
  return quoteChargeSelectionError(ids, lines, availability.data);
}

/** Keep the original source scope even after every traced editor row is removed. */
export function useInvoiceQuoteCharges(props: Props) {
  const { form, bookings, invoiceBookingsRows, existing, fromQuoteId, currentInvoiceId } = props;
  const selectedIds = useWatch({ control: form.control, name: "bookingIds" });
  const currentLines = useWatch({ control: form.control, name: "lineItems" });
  const ids = linkedBookingIds(selectedIds, existing, invoiceBookingsRows);
  const scope = quoteScopeBookings(bookings, invoiceBookingsRows);
  const relatedQuoteIds = collectInvoiceChargeQuoteIds({
    fromQuoteId, existingQuoteId: existing?.quote_id, originalLines: invoiceSourceLines(existing), currentLines: currentLines ?? [],
    bookingQuoteIds: ids.flatMap((id) => {
      const quote = scope.find((booking) => booking.id === id)?.quote_id;
      return quote ? [quote] : [];
    }),
  });
  const chargeAvailability = useQuoteChargeAvailability(relatedQuoteIds, currentInvoiceId);
  return {
    relatedQuoteIds,
    chargeAvailability,
    bookingSourceBlock: bookingScopeError(props, ids, scope),
    chargeAvailabilityError: availabilityError(relatedQuoteIds, currentLines ?? [], chargeAvailability),
  };
}

export function invoiceChargeBlock(loading: boolean, ...errors: (string | null)[]): string | null {
  if (loading) return "Verificando los cargos de las reservas…";
  return errors.find(Boolean) ?? null;
}
