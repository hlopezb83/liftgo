import { useState } from "react";

/**
 * Estado puramente local del UI para los diálogos de acción sobre una reserva:
 * extender duración y cambiar estatus. No conoce nada de la API ni de mutaciones.
 */
export function useBookingDialogsState() {
  const [extendOpen, setExtendOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");
  const [newEndDate, setNewEndDate] = useState<Date>();

  return {
    extendOpen, setExtendOpen,
    statusDialogOpen, setStatusDialogOpen,
    newStatus, setNewStatus,
    newEndDate, setNewEndDate,
  };
}
