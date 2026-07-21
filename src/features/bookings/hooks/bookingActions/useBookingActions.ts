import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { toYMD } from "@/lib/format/dateFormats";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useCreateBookingExtension } from "../useBookingExtensions";
import {
  useUpdateBooking,
  useDeleteBooking,
  useCancelBooking,
  type BookingWithForklift,
} from "../useBookings";

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

/**
 * Mutaciones + side-effects (toast, navegación) sobre una reserva.
 * Sin estado de UI; las páginas pasan los valores desde useBookingDialogsState.
 */
export function useBookingActions(booking: BookingWithForklift) {
  const navigate = useNavigateTransition();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const cancelBooking = useCancelBooking();
  const extendBooking = useCreateBookingExtension();

  const handleDelete = () => {
    deleteBooking.mutate(booking.id, {
      onSuccess: () => { notifySuccess("Reserva eliminada"); navigate("/bookings"); },
    });
  };

  const handleCancel = () => {
    cancelBooking.mutate(booking.id, {
      onSuccess: () => notifySuccess("Reserva cancelada"),
    });
  };

  const handleStatusChange = async (newStatus: string, onSuccess: () => void) => {
    if (!newStatus || newStatus === booking.status) return;
    try {
      if (newStatus === "cancelled") {
        cancelBooking.mutate(booking.id);
      } else {
        await new Promise<void>((resolve, reject) => {
          updateBooking.mutate(
            { id: booking.id, status: newStatus },
            { onSuccess: () => resolve(), onError: (err) => reject(err) }
          );
        });
      }
      notifySuccess(`Estatus cambiado a ${BOOKING_STATUS_LABELS[newStatus] || newStatus}`);
      onSuccess();
    } catch (err: unknown) {
      notifyError({ title: "Error al cambiar estatus: " + (err instanceof Error ? err.message : "Error desconocido") });
    }
  };

  // BL-A2: la extensión va por la RPC atómica `extend_booking` (FOR UPDATE +
  // buffer de mantenimiento + registro en booking_extensions). El UPDATE
  // directo de end_date bypasseaba todas las validaciones server-side y dejaba
  // el camino de la RPC como código muerto. El toast de éxito/error lo maneja
  // el propio hook de la mutación (useEntityMutation + translateDbError).
  const handleExtend = (newEndDate: Date | undefined, onDone: () => void) => {
    if (!newEndDate) return;
    extendBooking.mutate(
      {
        booking_id: booking.id,
        original_end_date: booking.end_date,
        new_end_date: toYMD(newEndDate),
      },
      { onSuccess: () => { onDone(); } }
    );
  };

  return {
    navigate,
    handleDelete, handleCancel, handleStatusChange, handleExtend,
    extendBookingPending: extendBooking.isPending,
  };
}
