import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { deliveryBookingDateError, deliveryQueries, type DeliveryBookingContext } from "@/features/deliveries";
import { todayKeyMty, toYMD } from "@/lib/format/dateFormats";
import { bookingQueries, type BookingWithForklift } from "../bookings/useBookings";
import { bookingNextStep } from "./bookingNextStep";

/** Context is created on demand and its facts are rechecked only on submit. */
export function useBookingTransportContext(booking: BookingWithForklift) {
  const queryClient = useQueryClient();
  return (type: "delivery" | "pickup"): DeliveryBookingContext => ({
    booking, type, verify: async (values) => {
      if (!onlineManager.isOnline()) return "Sin conexión. Reconéctate y reintenta para comprobar la reserva antes de guardar.";
      // Targeted reads with existing RLS and cache invalidation. This UI check
      // avoids known duplicates; it does not replace transactional DB guards.
      const [latestBooking, latestDeliveries] = await Promise.all([
        queryClient.fetchQuery({ ...bookingQueries.detail(booking.id), staleTime: 0 }),
        queryClient.fetchQuery({ ...deliveryQueries.list({ bookingId: booking.id }), staleTime: 0 }),
      ]);
      const latest = bookingNextStep(latestBooking, {
        deliveries: latestDeliveries, isLoading: false, isError: false,
      }, todayKeyMty());
      if (latestBooking.forklift_id !== values.forkliftId || latest.action?.kind !== "schedule" || latest.action.type !== type) {
        return "La reserva o sus transportes cambiaron. Cierra este formulario y revisa el siguiente paso actualizado.";
      }
      return deliveryBookingDateError(values.type, toYMD(values.scheduledDate), latestBooking);
    },
  });
}
