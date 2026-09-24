import { fromZonedTime } from "date-fns-tz";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useAuth } from "@/contexts/AuthContext";
import type { Booking } from "@/features/bookings";
import { useUserRole } from "@/features/users";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { APP_CONFIG } from "@/lib/config";
import { zodResolver } from "@/lib/forms/zodResolver";
import { useSearchParams } from "@/lib/router-compat";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { nowMty, parseDateLocal } from "@/lib/utils";
import { pickInspectorName, resolveInspectorName } from "../../lib/inspectorIdentity";
import {
  returnInspectionSchema,
  initialReturnInspectionForm,
  type ReturnInspectionFormValues,
} from "../../lib/returnInspectionSchema";
import { useCreateReturnInspection } from "../useReturnInspections";

export { returnInspectionSchema, initialReturnInspectionForm } from "../../lib/returnInspectionSchema";
export type { ReturnInspectionFormValues } from "../../lib/returnInspectionSchema";

export function useReturnInspectionDialog(activeBookings: Booking[] | undefined, canWrite: boolean) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // Hallazgo 9: el inspector se registra automáticamente con el usuario
  // autenticado; sólo un admin puede editar el campo (capacidad ya existente
  // como texto libre). Mientras el rol carga, el campo queda bloqueado.
  const { user } = useAuth();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
  const currentInspectorName = resolveInspectorName(user);
  const getDefaultValues = (): ReturnInspectionFormValues => ({
    ...initialReturnInspectionForm,
    inspectedAt: nowMty(),
    inspectedBy: currentInspectorName,
  });
  const form = useForm<ReturnInspectionFormValues>({
    resolver: zodResolver(returnInspectionSchema),
    defaultValues: getDefaultValues(),
  });
  const createInspection = useCreateReturnInspection();
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedBookingId = searchParams.get("booking_id");
  // Open even when the requested reservation is unavailable so the dialog
  // can explain eligibility. Refetches must not erase an inspector's draft.
  usePrefillEffect(() => {
    if (!canWrite || !requestedBookingId) return;
    form.reset({ ...getDefaultValues(), bookingId: requestedBookingId });
    setDialogOpen(true);
  }, [requestedBookingId, canWrite]);

  const handleDialogOpenChange = (open: boolean) => {
    if (open && !canWrite) return;
    setDialogOpen(open);
    if (!open && (searchParams.has("booking_id") || searchParams.has("early"))) {
      const next = new URLSearchParams(searchParams);
      next.delete("booking_id");
      next.delete("early");
      setSearchParams(next, { replace: true });
    }
  };

  const openNew = () => {
    if (!canWrite) return;
    form.reset(getDefaultValues());
    setDialogOpen(true);
  };

  const onSubmit = (values: ReturnInspectionFormValues) => {
    if (!canWrite) return;
    const booking = activeBookings?.find((b) => b.id === values.bookingId);
    if (!booking) {
      form.setError("bookingId", { message: "La reserva ya no está disponible para devolución. Actualiza la lista." });
      return;
    }
    if (values.inspectedAt < parseDateLocal(booking.start_date)) {
      form.setError("inspectedAt", { message: "La inspección no puede ser anterior al inicio de la renta." });
      return;
    }
    // Hallazgo 9: nunca guardar una inspección sin inspector identificado.
    const inspectorName = pickInspectorName({
      isAdmin,
      formValue: values.inspectedBy,
      currentUserName: currentInspectorName,
    });
    if (!inspectorName) {
      notifyValidation({
        title: "Inspector no identificado",
        message: "No se pudo identificar al usuario autenticado. Vuelve a iniciar sesión e intenta de nuevo.",
      });
      return;
    }
    const damageCost = values.damageCost ? parseFloat(values.damageCost) : 0;
    createInspection.mutate(
      {
        booking_id: values.bookingId,
        forklift_id: booking.forklift_id,
        condition: values.condition,
        damage_notes: values.damageNotes || null,
        damage_cost: damageCost,
        hours_used: values.hoursUsed ? parseFloat(values.hoursUsed) : null,
        fuel_level: values.fuelLevel || null,
        inspected_by: inspectorName,
        inspected_at: fromZonedTime(values.inspectedAt, APP_CONFIG.TIMEZONE).toISOString(),
      },
      {
        onSuccess: () => {
          // R6-FE-02 (N6-DIS-01): GUI-DB-04 cambió la RPC
          // `complete_return_inspection` (20260730135234): CUALQUIER condición
          // de daño (incluido minor_damage) envía la unidad a mantenimiento.
          // El conjunto debe coincidir con `v_is_damaged_condition` de la RPC.
          const goesToMaintenance =
            values.condition === "damaged" ||
            values.condition === "minor_damage" ||
            values.condition === "major_damage" ||
            values.condition === "needs_repair";
          notifySuccess(
            goesToMaintenance
              ? "Inspección registrada — montacargas enviado a mantenimiento"
              : "Inspección de devolución registrada — montacargas marcado como disponible",
          );
          handleDialogOpenChange(false);
          form.reset(getDefaultValues());
        },
      },
    );
  };

  return {
    dialogOpen: canWrite && dialogOpen,
    setDialogOpen: handleDialogOpenChange,
    form,
    openNew,
    handleSubmit: form.handleSubmit(onSubmit),
    isPending: createInspection.isPending,
    /** Hallazgo 9: sólo un admin puede cambiar el inspector. */
    inspectorLocked: !isAdmin,
  };
}
