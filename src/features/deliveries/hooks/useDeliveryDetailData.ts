import { useBooking } from "@/features/bookings";
import { useForkliftMap } from "@/features/fleet";
import { useDeliveries, useDelivery } from "./useDeliveries";

/** Carga las relaciones del transporte sin depender de listados truncados. */
export function useDeliveryDetailData(id?: string) {
  const deliveryQuery = useDelivery(id);
  const delivery = deliveryQuery.data;
  const bookingId = delivery?.booking_id ?? undefined;
  const { data: siblingDeliveries } = useDeliveries(bookingId);
  const bookingQuery = useBooking(bookingId);
  const { forkliftMap } = useForkliftMap();
  const forklift = delivery ? forkliftMap.get(delivery.forklift_id) : undefined;

  return {
    deliveryQuery,
    bookingQuery,
    hasLinkedBooking: Boolean(bookingId),
    linkedBooking: bookingQuery.data ?? null,
    siblingDeliveries,
    forklift,
  };
}
