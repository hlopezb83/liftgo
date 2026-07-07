import { useState, useCallback } from "react";
import { notifySuccess, notifyValidation } from "@/lib/ui/appFeedback";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "react-router-dom";

import { useCreateReturnInspection } from "../useReturnInspections";
import {
  returnInspectionSchema,
  initialReturnInspectionForm,
  type ReturnInspectionFormValues,
} from "../../lib/returnInspectionSchema";
import type { Booking } from "@/features/bookings";

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

  // Deep link via ?booking_id=...
  usePrefillEffect(() => {
    const bookingId = searchParams.get("booking_id");
    if (bookingId && activeBookings?.some((b) => b.id === bookingId)) {
      form.reset({ ...initialReturnInspectionForm, bookingId });
      setDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, activeBookings]);

  const openNew = useCallback(() => {
    form.reset(initialReturnInspectionForm);
    setDialogOpen(true);
  }, [form]);

  const onSubmit = useCallback(
    (values: ReturnInspectionFormValues) => {
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
            notifySuccess("Inspección de devolución registrada — montacargas marcado como disponible");
            setDialogOpen(false);
            form.reset(initialReturnInspectionForm);
          },
        },
      );
    },
    [bookings, createInspection, form],
  );

  return {
    dialogOpen,
    setDialogOpen,
    form,
    openNew,
    handleSubmit: form.handleSubmit(onSubmit),
    isPending: createInspection.isPending,
  };
}
