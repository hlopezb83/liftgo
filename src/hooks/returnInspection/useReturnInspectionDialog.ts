import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useFormState } from "@/hooks/useFormState";
import { useCreateReturnInspection } from "@/hooks/useReturnInspections";
import type { Booking } from "@/hooks/useBookings";

export const initialReturnInspectionForm = {
  bookingId: "" as string,
  inspectedAt: new Date() as Date,
  condition: "good" as string,
  damageNotes: "" as string,
  damageCost: "" as string,
  hoursUsed: "" as string,
  fuelLevel: "" as string,
  inspectedBy: "" as string,
};

export function useReturnInspectionDialog(bookings: Booking[] | undefined, activeBookings: Booking[] | undefined) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialReturnInspectionForm);
  const createInspection = useCreateReturnInspection();
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep link via ?booking_id=...
  useEffect(() => {
    const bookingId = searchParams.get("booking_id");
    if (bookingId && activeBookings?.some((b) => b.id === bookingId)) {
      reset();
      set("bookingId", bookingId);
      setDialogOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, activeBookings]);

  const openNew = useCallback(() => {
    reset();
    setDialogOpen(true);
  }, [reset]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.bookingId) {
        toast.error("Selecciona una reserva para devolver");
        return;
      }
      const booking = bookings?.find((b) => b.id === form.bookingId);
      if (!booking) return;
      const damageCost = form.damageCost ? parseFloat(form.damageCost) : 0;
      createInspection.mutate(
        {
          booking_id: form.bookingId,
          forklift_id: booking.forklift_id,
          condition: form.condition,
          damage_notes: form.damageNotes || null,
          damage_cost: damageCost,
          hours_used: form.hoursUsed ? parseFloat(form.hoursUsed) : null,
          fuel_level: form.fuelLevel || null,
          inspected_by: form.inspectedBy || null,
          inspected_at: form.inspectedAt.toISOString(),
        },
        {
          onSuccess: () => {
            toast.success("Inspección de devolución registrada — montacargas marcado como disponible");
            setDialogOpen(false);
            reset();
          },
        },
      );
    },
    [form, bookings, createInspection, reset],
  );

  return {
    dialogOpen,
    setDialogOpen,
    form,
    set,
    openNew,
    handleSubmit,
    isPending: createInspection.isPending,
  };
}
