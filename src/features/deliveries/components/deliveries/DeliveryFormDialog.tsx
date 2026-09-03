import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { PlusCircle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useBookings } from "@/features/bookings";
import { useActiveDrivers, useForkliftMap } from "@/features/fleet";
import { toYMD } from "@/lib/format/dateFormats";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { useCreateDelivery } from "../../hooks/useDeliveries";
import { deliverySchema } from "../../lib/deliveryFormSchema";
import { DeliveryFormFields, type DeliveryFormValues } from "./DeliveryFormFields";

const initialForm: DeliveryFormValues = {
  forkliftId: "", bookingId: "", type: "delivery",
  alreadyCompleted: false,
  scheduledDate: nowMty(), scheduledTime: "",
  address: "", driverName: "", driverPhone: "", notes: "",
  noEvidenceReason: "",
};

interface DeliveryFormDialogProps {
  /**
   * Control externo opcional del estado abierto (p. ej. el CTA del EmptyState
   * de la página). Sin estas props el diálogo se auto-gestiona, como antes.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeliveryFormDialog({ open: openProp, onOpenChange }: DeliveryFormDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onOpenChange?.(v);
  };
  const form = useForm<DeliveryFormValues>({
    resolver: zodResolver(deliverySchema),
    defaultValues: initialForm,
  });
  const { forklifts } = useForkliftMap();
  const { data: bookings } = useBookings();
  const { data: activeDrivers } = useActiveDrivers();
  const createDelivery = useCreateDelivery();

  const onSubmit = (values: DeliveryFormValues) => {
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
          notifySuccess("Transporte programado");
          setOpen(false);
          form.reset(initialForm);
        },
      }
    );
  };

  return (
    <>
      <Button onClick={() => { form.reset(initialForm); setOpen(true); }} size="sm">
        <PlusCircle className="h-4 w-4 mr-1" /> Programar
      </Button>

      <FormDialog
      isPending={createDelivery.isPending}
      isDirty={form.formState.isDirty}
      open={open} onOpenChange={setOpen} title="Programar transporte">

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <DeliveryFormFields form={form} forklifts={forklifts} bookings={bookings} activeDrivers={activeDrivers} />
          <FormDialogFooter>
            <FormActions submitLabel="Programar" isPending={createDelivery.isPending} onCancel={() => setOpen(false)} />
          </FormDialogFooter>
        </form>
      </FormDialog>
    </>
  );
}
