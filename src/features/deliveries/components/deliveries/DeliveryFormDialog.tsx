import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";

import { PlusCircle, TruckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormActions } from "@/components/forms/FormActions";
import { useActiveDrivers, useForkliftMap } from "@/features/fleet";
import { useBookings } from "@/features/bookings";
import { useCreateDelivery } from "../../hooks/useDeliveries";
import { deliverySchema } from "../../lib/deliveryFormSchema";
import { DeliveryFormFields, type DeliveryFormValues } from "./DeliveryFormFields";
import { notifySuccess } from "@/lib/ui/appFeedback";

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
        scheduled_date: format(values.scheduledDate, "yyyy-MM-dd"),
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TruckIcon className="h-4 w-4" /> Programar Transporte</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <DeliveryFormFields form={form} forklifts={forklifts} bookings={bookings} activeDrivers={activeDrivers} />
            <FormActions submitLabel="Programar" isPending={createDelivery.isPending} onCancel={() => setOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
