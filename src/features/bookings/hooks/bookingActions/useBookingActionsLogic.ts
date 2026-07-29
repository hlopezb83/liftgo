import { useUserRole } from "@/features/users";
import { useBookingActions } from "./useBookingActions";
import { useBookingDialogsState } from "./useBookingDialogsState";
import { useExtendBookingPreview } from "./useExtendBookingPreview";
import type { BookingWithForklift } from "../bookings/useBookings";

// Re-export para preservar imports existentes. La fuente canónica vive en
// `bookingActions/useBookingActions`. Se eliminó el alias `STATUS_LABELS`
// (duplicaba el nombre canónico y creaba ambigüedad).
export { BOOKING_STATUS_LABELS } from "./useBookingActions";

export function getValidTransitions(current: string): string[] {
  switch (current) {
    // D3-r3: "Completar" sale del diálogo — sin inspección de retorno la DB
    // rechaza confirmed→completed (guard DB2-05) con error SQL crudo. El
    // cierre real de una renta ocurre en /returns vía complete_return_inspection.
    case "confirmed": return ["cancelled"];
    // R2-5: una reserva completada es terminal en la UI; revivirla a
    // "confirmed" permitía doble reserva traslapada del mismo montacargas.
    // La DB refuerza esto quitándolo de la whitelist de validate_transition.
    case "completed": return [];
    // P0-2: una reserva cancelada es terminal en la UI; revivirla permitía
    // doble reserva del mismo montacargas. La DB refuerza esto con trigger.
    case "cancelled": return [];
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
    extendBookingPending: actions.extendBookingPending,
  };
}
