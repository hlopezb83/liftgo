import { useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useForklifts } from "@/hooks/useForklifts";
import {
  useUpdateBooking,
  useDeleteBooking,
  useCancelBooking,
  type BookingWithForklift,
} from "@/hooks/useBookings";
import { generateLineItems, computeTotals } from "@/lib/invoiceUtils";
import { useUserRole } from "@/hooks/useUserRole";

export const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
};

export function getValidTransitions(current: string): string[] {
  switch (current) {
    case "confirmed": return ["completed", "cancelled"];
    case "completed": return ["confirmed"];
    case "cancelled": return ["confirmed"];
    default: return [];
  }
}

export function useBookingActionsLogic(booking: BookingWithForklift) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newEndDate, setNewEndDate] = useState<Date>();

  const { data: forklifts } = useForklifts();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();
  const cancelBooking = useCancelBooking();
  const navigate = useNavigate();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin";

  const handleDelete = () => {
    deleteBooking.mutate(booking.id, {
      onSuccess: () => { toast.success("Reserva eliminada"); navigate("/bookings"); },
    });
  };

  const handleCancel = () => {
    cancelBooking.mutate(booking.id, {
      onSuccess: () => toast.success("Reserva cancelada"),
    });
  };

  const handleStatusChange = async () => {
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
      toast.success(`Estatus cambiado a ${STATUS_LABELS[newStatus] || newStatus}`);
      setStatusDialogOpen(false);
    } catch (err: unknown) {
      toast.error("Error al cambiar estatus: " + (err instanceof Error ? err.message : "Error desconocido"));
    }
  };

  const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
  const extendPreview = (() => {
    if (!forklift || !newEndDate) return null;
    const items = generateLineItems(forklift, booking.start_date, format(newEndDate, "yyyy-MM-dd"));
    return computeTotals(items, 21);
  })();

  const handleExtend = (onDone: () => void) => {
    if (!newEndDate) return;
    updateBooking.mutate(
      { id: booking.id, end_date: format(newEndDate, "yyyy-MM-dd") },
      { onSuccess: () => { toast.success("Reserva extendida"); onDone(); } }
    );
  };

  return {
    isAdmin, navigate,
    extendOpen, setExtendOpen,
    statusDialogOpen, setStatusDialogOpen,
    newStatus, setNewStatus,
    newEndDate, setNewEndDate,
    extendPreview,
    handleDelete, handleCancel, handleStatusChange, handleExtend,
    updateBookingPending: updateBooking.isPending,
  };
}
