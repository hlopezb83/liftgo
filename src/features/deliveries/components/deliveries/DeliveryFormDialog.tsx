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
import { useCreateDelivery } from "../../hooks/useDeliveries";
import { deliverySchema } from "../../lib/deliveryFormSchema";
import { DeliveryFormFields, type DeliveryFormValues } from "./DeliveryFormFields";

const initialForm: DeliveryFormValues = {
  forkliftId: "", bookingId: "", type: "delivery",
  scheduledDate: new Date(), scheduledTime: "",
  address: "", driverName: "", driverPhone: "", notes: "",
};

export function DeliveryFormDialog() {
  const [open, setOpen] = useState(false);
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
      isPending={createDelivery.isPending} open={open} onOpenChange={setOpen} title="Programar Transporte">
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
