import { useState } from "react";
import { useForm } from "react-hook-form";
import { DateField, NumberField, TextField, TextareaField } from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { FleetIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/date/toYMD";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useCreateDelivery } from "../../hooks/useDeliveries";
import { createPickupSchema, defaultPickupDate, isPastPickupDate, type PickupFormValues } from "../../lib/postDeliveryPickupForm";

interface DeliverySource {
  forklift_id: string;
  booking_id: string | null;
  address: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  hours_reading: number | null;
}

interface PostDeliveryPickupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: DeliverySource;
  bookingEndDate: string;
  forkliftName: string;
}

interface BodyProps extends Omit<PostDeliveryPickupDialogProps, "open"> {
  createDelivery: ReturnType<typeof useCreateDelivery>;
}

/** Se monta al abrir para renovar fecha, borrador y confirmación de descarte. */
function PickupDialogBody({ delivery, bookingEndDate, forkliftName, onOpenChange, createDelivery }: BodyProps) {
  const [showForm, setShowForm] = useState(false);
  const form = useForm<PickupFormValues>({
    resolver: zodResolver(createPickupSchema(delivery.hours_reading)),
    defaultValues: {
      scheduledDate: defaultPickupDate(bookingEndDate),
      address: delivery.address || "",
      driverName: delivery.driver_name || "",
      driverPhone: delivery.driver_phone || "",
      scheduledTime: "", hoursReading: null, notes: "",
    },
  });

  const handleSchedule = form.handleSubmit((values) => {
    if (createDelivery.isPending) return;
    createDelivery.mutate(
      {
        forklift_id: delivery.forklift_id,
        booking_id: delivery.booking_id,
        type: "pickup",
        scheduled_date: toYMD(values.scheduledDate),
        scheduled_time: values.scheduledTime || null,
        address: values.address || null,
        driver_name: values.driverName || null,
        driver_phone: values.driverPhone || null,
        notes: values.notes || null,
        hours_reading: values.hoursReading,
      },
      { onSuccess: () => { notifySuccess("Recolección programada"); onOpenChange(false); } },
    );
  });

  return (
    <FormDialog
      open
      onOpenChange={onOpenChange}
      isPending={createDelivery.isPending || form.formState.isSubmitting}
      isDirty={form.formState.isDirty}
      width="md"
      title="¿Programar recolección?"
      description={
        <span className="flex items-start gap-2">
          <FleetIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>La entrega de {forkliftName || "el equipo"} se completó. ¿Deseas programar la recolección?</span>
        </span>
      }
    >
      {showForm ? (
        <Form {...form}>
          <form onSubmit={handleSchedule} className="space-y-4">
            <PickupFields form={form} minHours={delivery.hours_reading} />
            <FormDialogFooter>
              <FormActions
                submitLabel="Programar recolección"
                isPending={createDelivery.isPending}
                onCancel={() => onOpenChange(false)}
              />
            </FormDialogFooter>
          </form>
        </Form>
      ) : (
        <FormDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button type="button" className="w-full" disabled={createDelivery.isPending} onClick={() => setShowForm(true)}>
            <FleetIcon className="h-4 w-4 mr-2" /> Programar recolección
          </Button>
          <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={createDelivery.isPending} label="Omitir por ahora" />
        </FormDialogFooter>
      )}
    </FormDialog>
  );
}

function PickupFields({ form, minHours }: {
  form: ReturnType<typeof useForm<PickupFormValues>>;
  minHours: number | null;
}) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DateField control={form.control} name="scheduledDate" label="Fecha de recolección" required disabledMatcher={isPastPickupDate} />
        <TextField control={form.control} name="scheduledTime" label="Hora" type="time" />
      </div>
      <TextField control={form.control} name="address" label="Dirección de recolección" placeholder="Ingresa la dirección" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField control={form.control} name="driverName" label="Nombre del operador" />
        <TextField control={form.control} name="driverPhone" label="Teléfono del operador" type="tel" />
      </div>
      <NumberField
        control={form.control}
        name="hoursReading"
        label="Horómetro (hrs)"
        min={minHours ?? 0}
        step={0.1}
        placeholder="Ej: 1250"
        description={minHours !== null ? `Última lectura de entrega: ${minHours} hrs.` : undefined}
      />
      <TextareaField control={form.control} name="notes" label="Notas" rows={2} />
    </>
  );
}

export function PostDeliveryPickupDialog({ open, ...props }: PostDeliveryPickupDialogProps) {
  const createDelivery = useCreateDelivery();
  return open ? (
    <PickupDialogBody
      key={`${props.delivery.forklift_id}-${props.delivery.booking_id ?? "sin-reserva"}`}
      {...props}
      createDelivery={createDelivery}
    />
  ) : null;
}
