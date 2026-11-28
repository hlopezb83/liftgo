import { useState } from "react";
import { useWatch, type Control } from "react-hook-form";
import type { BookingWithForklift } from "@/features/bookings";
import type { useQuoteAssignments } from "@/features/fleet";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useInvoiceBookingCandidates } from "../useInvoiceBookingCandidates";
import { useInvoiceRentalEquipment } from "./useInvoiceRentalEquipment";
import type { ExistingInvoice } from "./invoiceFormBuilders";
import type { BillableBooking } from "../../lib/bookingCompatibility";
import type { InvoiceFormValues } from "../../lib/invoiceFormSchema";

/** Reservas confirmadas o completadas con periodo pendiente (+ extensión en curso).
 * La devolución cierra la operación, no la obligación de facturar la renta. */
export type InvoiceBillingBooking = BookingWithForklift & Pick<BillableBooking, "pending_billing_period">;

export function filterAvailableBookings(
  bookings: InvoiceBillingBooking[] | undefined,
  invoicedBookingIds: Set<string>,
  extensionBookingId: string | null,
): InvoiceBillingBooking[] | undefined {
  return bookings?.filter(
    (booking) =>
      (booking.status === "confirmed" || booking.status === "completed") &&
      (!invoicedBookingIds.has(booking.id) || booking.id === extensionBookingId),
  );
}

function linkedCandidateIds(ids: string[], existing?: ExistingInvoice | null) {
  return existing?.booking_id ? [...ids, existing.booking_id] : ids;
}

export function candidateAvailabilityBlock(query: { isError: boolean; isSuccess: boolean }) {
  if (query.isError) return "No se pudieron consultar las reservas facturables. Reintenta la consulta.";
  return query.isSuccess ? null : "Espera a que carguen las reservas facturables.";
}

export function useInvoiceBookingPicker(
  control: Control<InvoiceFormValues>,
  ids: string[],
  isEdit: boolean,
  existing?: ExistingInvoice | null,
) {
  const [selectedBookingIds, customerId] = useWatch({ control, name: ["bookingIds", "customerId"] });
  const [picker, setPicker] = useState({ search: "", page: 0, customerId: "" });
  const page = picker.customerId === customerId ? picker.page : 0;
  const search = useDebouncedValue(picker.search);
  const linkedIds = linkedCandidateIds([...ids, ...(selectedBookingIds ?? [])], existing);
  const bookingsQuery = useInvoiceBookingCandidates(linkedIds, {
    search,
    page,
    customerId: selectedBookingIds?.length ? customerId || null : null,
    linkedOnly: isEdit,
  });
  const bookingPicker = {
    search: picker.search,
    page,
    hasMore: bookingsQuery.hasMore,
    isLoading: picker.search !== search || bookingsQuery.isPending || !!bookingsQuery.isPlaceholderData,
    isError: bookingsQuery.isError,
    onRetry: () => { void bookingsQuery.refetch(); },
    onSearchChange: (value: string) => setPicker({ search: value, page: 0, customerId }),
    onPageChange: (next: number) => setPicker({ search: picker.search, page: next, customerId }),
  };
  return { selectedBookingIds, bookingsQuery, bookingPicker };
}

export function includeSelectedBookings(
  available: InvoiceBillingBooking[] | undefined,
  bookings: BookingWithForklift[] | undefined,
  selected: Set<string>,
) {
  const visible = new Set(available?.map((booking) => booking.id));
  // Keep a removable chip while a refresh marks a selected row unavailable.
  return [
    ...(available ?? []),
    ...(bookings ?? []).filter((booking) => selected.has(booking.id) && !visible.has(booking.id)),
  ];
}

export function withEvidenceLoading(
  picker: ReturnType<typeof useInvoiceBookingPicker>["bookingPicker"],
  periods: { isFetching: boolean; ready: boolean },
) {
  return { ...picker, isLoading: picker.isLoading || (periods.isFetching && !periods.ready) };
}

function recurringEquipmentIds(bookings: BookingWithForklift[] | undefined) {
  return (bookings ?? [])
    .filter((booking) => booking.status === "completed" && booking.recurring_billing && booking.monthly_rate == null)
    .map((booking) => booking.forklift_id);
}

export function useBillingEquipment(
  assignments: ReturnType<typeof useQuoteAssignments>["data"],
  bookings: BookingWithForklift[] | undefined,
) {
  const ids = [
    ...(assignments ?? []).map((assignment) => assignment.forklift_id),
    ...recurringEquipmentIds(bookings),
  ];
  const equipment = useInvoiceRentalEquipment(ids);
  return { ...equipment, retry: () => (ids.length ? equipment.refetch() : Promise.resolve()) };
}
