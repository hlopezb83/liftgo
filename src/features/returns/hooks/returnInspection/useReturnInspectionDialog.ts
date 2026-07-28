import { useState } from "react";
import { useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import type { Booking } from "@/features/bookings";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import {
  returnInspectionSchema,
  initialReturnInspectionForm,
  type ReturnInspectionFormValues,
} from "../../lib/returnInspectionSchema";
import { useCreateReturnInspection } from "../useReturnInspections";

export { returnInspectionSchema, initialReturnInspectionForm } from "../../lib/returnInspectionSchema";
export type { ReturnInspectionFormValues } from "../../lib/returnInspectionSchema";

export function useReturnInspectionDialog(bookings: Booking[] | undefined, activeBookings: Booking[] | undefined) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const form = useForm<ReturnInspectionFormValues>({
    resolver: zodResolver(returnInspectionSchema),
    defaultValues: initialReturnInspectionForm,
  });
  const createInspection = useCreateReturnInspection();
  const [searchParams, setSearchParams] = useSearchParams();

  // R11 DIFF 3: no limpiamos los params al abrir para que `early=1` siga
  // vigente y la reserva prellenada permanezca en `activeBookings` (que se
  // recalcula en el padre según `early`). Se limpian al cerrar el diálogo.
  usePrefillEffect(() => {
    const bookingId = searchParams.get("booking_id");
    if (bookingId && activeBookings?.some((b) => b.id === bookingId)) {
      form.reset({ ...initialReturnInspectionForm, bookingId });
      setDialogOpen(true);
    }
  }, [searchParams, activeBookings]);

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && (searchParams.has("booking_id") || searchParams.has("early"))) {
      const next = new URLSearchParams(searchParams);
      next.delete("booking_id");
      next.delete("early");
      setSearchParams(next, { replace: true });
    }
  };

  const openNew = () => {
    form.reset(initialReturnInspectionForm);
    setDialogOpen(true);
  };

  const onSubmit = (values: ReturnInspectionFormValues) => {
    const booking = bookings?.find((b) => b.id === values.bookingId);
    if (!booking) {
      notifyValidation({ message: "Reserva no encontrada" });
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
        inspected_by: values.inspectedBy || null,
        inspected_at: values.inspectedAt.toISOString(),
      },
      {
        onSuccess: () => {
          // R17-W: el mensaje debe reflejar el estado real al que va el equipo.
          // `damaged` → mantenimiento; el resto → disponible.
          // R18: `INSPECTION_CONDITIONS` no incluye "damaged"; usamos los
          // valores reales que sí implican mantenimiento.
          const goesToMaintenance =
            values.condition === "minor_damage" ||
            values.condition === "major_damage" ||
            values.condition === "needs_repair" ||
            damageCost > 0;
          notifySuccess(
            goesToMaintenance
              ? "Inspección registrada — montacargas enviado a mantenimiento"
              : "Inspección de devolución registrada — montacargas marcado como disponible",
          );
          setDialogOpen(false);
          form.reset(initialReturnInspectionForm);
        },
      },
    );
  };

  return {
    dialogOpen,
    setDialogOpen: handleDialogOpenChange,
    form,
    openNew,
    handleSubmit: form.handleSubmit(onSubmit),
    isPending: createInspection.isPending,
  };
}
