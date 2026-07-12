import { toYMD } from "@/lib/format/dateFormats";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
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

  const handleExtend = (newEndDate: Date | undefined, onDone: () => void) => {
    if (!newEndDate) return;
    updateBooking.mutate(
      { id: booking.id, end_date: toYMD(newEndDate) },
      { onSuccess: () => { notifySuccess("Reserva extendida"); onDone(); } }
    );
  };

  return {
    navigate,
    handleDelete, handleCancel, handleStatusChange, handleExtend,
    updateBookingPending: updateBooking.isPending,
  };
}
