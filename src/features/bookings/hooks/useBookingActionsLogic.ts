import { useUserRole } from "@/features/users";
import type { BookingWithForklift } from "./useBookings";
import { useBookingDialogsState } from "./bookingActions/useBookingDialogsState";
import { useBookingActions } from "./bookingActions/useBookingActions";
import { useExtendBookingPreview } from "./bookingActions/useExtendBookingPreview";

// Re-export para preservar imports existentes. La fuente canónica vive en
// `bookingActions/useBookingActions`. Se eliminó el alias `STATUS_LABELS`
// (duplicaba el nombre canónico y creaba ambigüedad).
export { BOOKING_STATUS_LABELS } from "./bookingActions/useBookingActions";

export function getValidTransitions(current: string): string[] {
  switch (current) {
    case "confirmed": return ["completed", "cancelled"];
    case "completed": return ["confirmed"];
    case "cancelled": return ["confirmed"];
    default: return [];
  }
}

/**
 * Orquestador delgado que combina los tres hooks atómicos:
 * - useBookingDialogsState  → estado de UI
 * - useBookingActions       → mutaciones + side-effects
 * - useExtendBookingPreview → cálculo derivado
 *
 * Mantenido por compatibilidad con BookingActions / BookingActionDialogs.
 * Para uso nuevo se recomienda consumir los hooks atómicos directamente.
 */
export function useBookingActionsLogic(booking: BookingWithForklift) {
  const dialogs = useBookingDialogsState();
  const actions = useBookingActions(booking);
  const extendPreview = useExtendBookingPreview(booking, dialogs.newEndDate);
  const { data: role } = useUserRole();
  const isAdmin = role === "admin";

  return {
    isAdmin,
    navigate: actions.navigate,
    ...dialogs,
    extendPreview,
    handleDelete: actions.handleDelete,
    handleCancel: actions.handleCancel,
    handleStatusChange: () =>
      actions.handleStatusChange(dialogs.newStatus, () => dialogs.setStatusDialogOpen(false)),
    handleExtend: (onDone: () => void) => actions.handleExtend(dialogs.newEndDate, onDone),
    updateBookingPending: actions.updateBookingPending,
  };
}
