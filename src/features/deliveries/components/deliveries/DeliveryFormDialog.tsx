import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { PlusCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useConfirmedBookingsForDelivery } from "@/features/bookings";
import { useActiveDrivers, useForklift, useForkliftMap } from "@/features/fleet";
import { useHasModuleAccess } from "@/features/users";
import { toYMD } from "@/lib/format/dateFormats";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { useCreateDelivery } from "../../hooks/useDeliveries";
import { deliveryBookingDateError } from "../../lib/deliveryBookingDate";
import { deliverySchema } from "../../lib/deliveryFormSchema";
import { DeliveryFormFields, type DeliveryFormValues } from "./DeliveryFormFields";

const getInitialForm = (): DeliveryFormValues => ({
  forkliftId: "", bookingId: "", type: "delivery",
  alreadyCompleted: false,
  scheduledDate: nowMty(), scheduledTime: "",
  address: "", driverName: "", driverPhone: "", notes: "",
  noEvidenceReason: "",
});

interface DeliveryFormDialogProps {
  /**
   * Control externo opcional del estado abierto (p. ej. el CTA del EmptyState
   * de la página). Sin estas props el diálogo se auto-gestiona, como antes.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeliveryFormDialog({ open: openProp, onOpenChange }: DeliveryFormDialogProps = {}) {
  const canWrite = useHasModuleAccess("Entregas", "full");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = canWrite && (openProp ?? internalOpen);
  const setOpen = (v: boolean) => {
    if (v && !canWrite) return;
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: getInitialForm(),
  });
  const { forklifts } = useForkliftMap();
  const bookingQuery = useConfirmedBookingsForDelivery(open);
  const bookings = bookingQuery.data?.pages.flatMap((page) => page.slice(0, 100));
  const selectedBookingId = useWatch({ control: form.control, name: "bookingId" });
  const alreadyCompleted = useWatch({ control: form.control, name: "alreadyCompleted" });
  const selectedForkliftId = bookings?.find((booking) => booking.id === selectedBookingId)?.forklift_id;
  const { data: selectedForklift } = useForklift(selectedForkliftId);
  const forkliftOptions = selectedForklift && !forklifts?.some((forklift) => forklift.id === selectedForklift.id)
    ? [...(forklifts ?? []), selectedForklift] : forklifts;
  const { data: activeDrivers } = useActiveDrivers();
  const createDelivery = useCreateDelivery();

  const onSubmit = (values: DeliveryFormValues) => {
    if (!canWrite) return;
    const booking = bookings?.find((b) => b.id === values.bookingId);
    if (booking) {
      const dateError = deliveryBookingDateError(values.type, toYMD(values.scheduledDate), booking);
      if (dateError) {
        form.setError("scheduledDate", { type: "manual", message: dateError });
        return;
      }
    }
    createDelivery.mutate(
      {
        forklift_id: values.forkliftId,
        booking_id: values.bookingId || null,
        type: values.type,
        scheduled_date: toYMD(values.scheduledDate),
        scheduled_time: values.scheduledTime || null,
        address: values.address || null,
        driver_name: values.driverName || null,
        driver_phone: values.driverPhone || null,
        notes: values.notes || null,
        status: values.alreadyCompleted ? "completed" : "scheduled",
        // Bugs 1-2: completed_at lo sella el trigger de DB con el reloj del
        // servidor (el reloj del navegador producía timestamps < created_at).
        // Bug 3: histórico sin operador → guardar la justificación capturada.
        completed_no_evidence_reason:
          values.alreadyCompleted && !values.driverName.trim() && values.noEvidenceReason.trim()
            ? values.noEvidenceReason.trim()
            : null,
      },
      {
        onSuccess: () => {
          notifySuccess(values.alreadyCompleted ? "Transporte registrado como completado" : "Transporte programado");
          setOpen(false);
          form.reset(getInitialForm());
        },
      }
    );
  };

  if (!canWrite) return null;

  return (
    <>
      <Button onClick={() => { form.reset(getInitialForm()); setOpen(true); }} size="sm">
        <PlusCircle className="h-4 w-4 mr-1" /> Programar
      </Button>

      <FormDialog
      isPending={createDelivery.isPending}
      isDirty={form.formState.isDirty}
      open={open} onOpenChange={setOpen} title={alreadyCompleted ? "Registrar transporte realizado" : "Programar transporte"}>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DeliveryFormFields
            form={form} forklifts={forkliftOptions} bookings={bookings} activeDrivers={activeDrivers}
            bookingsLoading={bookingQuery.isLoading || bookingQuery.isFetchingNextPage}
            bookingsError={bookingQuery.isError}
            hasMoreBookings={bookingQuery.hasNextPage}
            onLoadMoreBookings={() => { void bookingQuery.fetchNextPage(); }}
          />
          <FormDialogFooter>
            <FormActions submitLabel={alreadyCompleted ? "Registrar como completado" : "Programar"} isPending={createDelivery.isPending} onCancel={() => setOpen(false)} />
          </FormDialogFooter>
        </form>
      </FormDialog>
    </>
  );
}
