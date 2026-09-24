import { useForm } from "react-hook-form";
import { z } from "zod";
import { DateField, TextField, TextareaField } from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Form } from "@/components/ui/form";
import type { Tables } from "@/integrations/supabase/types";
import { formatMtyCalendarDate } from "@/lib/date/mtyCalendarDate";
import { toYMD } from "@/lib/date/toYMD";
import { deliveryBookingDateError } from "@/lib/domain/deliveryBookingDate";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { nowMty, parseDateLocal } from "@/lib/utils";
import { useUpdateDelivery } from "../../hooks/useDeliveries";

const schema = z.object({
  scheduledDate: z.date({ error: "Fecha requerida" }),
  scheduledTime: z.string(),
  address: z.string(),
  driverName: z.string(),
  driverPhone: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;
type BookingWindow = Pick<Tables<"bookings">, "start_date" | "end_date">;

interface Props {
  delivery: Tables<"deliveries">;
  linkedBooking: BookingWindow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RescheduleDeliveryDialog({ delivery, linkedBooking, open, onOpenChange }: Props) {
  const updateDelivery = useUpdateDelivery();
  const operationLabel = delivery.type === "pickup" ? "recolección" : delivery.type === "return" ? "devolución" : "entrega";
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      scheduledDate: parseDateLocal(delivery.scheduled_date) ?? nowMty(),
      scheduledTime: delivery.scheduled_time ?? "",
      address: delivery.address ?? "",
      driverName: delivery.driver_name ?? "",
      driverPhone: delivery.driver_phone ?? "",
      notes: delivery.notes ?? "",
    },
  });

  const onSubmit = (values: FormValues) => {
    const date = toYMD(values.scheduledDate);
    const today = toYMD(nowMty());
    if (date < today) {
      form.setError("scheduledDate", { message: "Elige hoy o una fecha futura" });
      return;
    }
    if (linkedBooking) {
      const dateError = deliveryBookingDateError(delivery.type, date, linkedBooking);
      if (dateError) {
        form.setError("scheduledDate", { type: "manual", message: dateError });
        return;
      }
    }

    updateDelivery.mutate({
      id: delivery.id,
      scheduled_date: date,
      scheduled_time: values.scheduledTime || null,
      address: values.address.trim() || null,
      driver_name: values.driverName.trim() || null,
      driver_phone: values.driverPhone.trim() || null,
      notes: values.notes.trim() || null,
    }, {
      onSuccess: () => {
        notifySuccess(`${operationLabel.charAt(0).toUpperCase()}${operationLabel.slice(1)} reprogramada`);
        onOpenChange(false);
      },
    });
  };

  return (
    <FormDialog
      title={`Reprogramar ${operationLabel}`}
      description="Ajusta la fecha y los datos de despacho antes de completar la entrega."
      open={open}
      onOpenChange={onOpenChange}
      isPending={updateDelivery.isPending}
      isDirty={form.formState.isDirty}
      width="md"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {linkedBooking && (
            <p className="text-sm text-muted-foreground">
              Periodo de renta: {formatMtyCalendarDate(parseDateLocal(linkedBooking.start_date))}
              {" – "}
              {formatMtyCalendarDate(parseDateLocal(linkedBooking.end_date))}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField control={form.control} name="scheduledDate" label={`Fecha de ${operationLabel}`} required />
            <TextField control={form.control} name="scheduledTime" label="Hora programada" type="time" />
          </div>
          <TextField control={form.control} name="address" label="Dirección de entrega" />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField control={form.control} name="driverName" label="Nombre del operador" />
            <TextField control={form.control} name="driverPhone" label="Teléfono del operador" type="tel" />
          </div>
          <TextareaField control={form.control} name="notes" label="Notas" rows={3} />
          <FormDialogFooter>
            <FormActions
              submitLabel="Guardar cambios"
              isPending={updateDelivery.isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
