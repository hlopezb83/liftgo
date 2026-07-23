import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { NumberField, TextField, TextareaField } from "@/components/forms/fields";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FleetIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@/lib/forms/zodResolver";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useCreateDelivery } from "../../hooks/useDeliveries";

interface PostDeliveryPickupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: {
    forklift_id: string;
    booking_id: string | null;
    address: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    hours_reading: number | null;
  };
  bookingEndDate: string;
  forkliftName: string;
}

// BL-42 (horómetro): la recolección no puede tener menos horas que la entrega.
const makeSchema = (minHours: number | null) => z.object({
  address: z.string().default(""),
  driverName: z.string().default(""),
  driverPhone: z.string().default(""),
  scheduledTime: z.string().default(""),
  hoursReading: z.number().min(0).nullable().default(null).refine(
    (v) => v === null || minHours === null || v >= minHours,
    {
      message: minHours !== null
        ? `El horómetro no puede ser menor a ${minHours} hrs (registradas en la entrega).`
        : "Horómetro inválido",
    },
  ),
  notes: z.string().default(""),
});
type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function PostDeliveryPickupDialog({ open, onOpenChange, delivery, bookingEndDate, forkliftName }: PostDeliveryPickupDialogProps) {
  const createDelivery = useCreateDelivery();
  const [showForm, setShowForm] = useState(false);
  const minHours = delivery.hours_reading;

  const form = useForm<FormValues>({
    resolver: zodResolver(makeSchema(minHours)),
    defaultValues: {
      address: delivery.address || "",
      driverName: delivery.driver_name || "",
      driverPhone: delivery.driver_phone || "",
      scheduledTime: "", hoursReading: null, notes: "",
    },
  });

  useEffect(() => {
    // Reset local UI state y form al abrir/cerrar el diálogo. `form.reset` de
    // react-hook-form debe ejecutarse fuera del render (patrón oficial).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) setShowForm(false);
    if (open) {
      form.reset({
        address: delivery.address || "",
        driverName: delivery.driver_name || "",
        driverPhone: delivery.driver_phone || "",
        scheduledTime: "", hoursReading: null, notes: "",
      });
    }
  }, [open, delivery, form]);

  const handleSchedule = form.handleSubmit((values) => {
    createDelivery.mutate(
      {
        forklift_id: delivery.forklift_id,
        booking_id: delivery.booking_id,
        type: "pickup",
        scheduled_date: bookingEndDate,
        scheduled_time: values.scheduledTime || null,
        address: values.address || null,
        driver_name: values.driverName || null,
        driver_phone: values.driverPhone || null,
        notes: values.notes || null,
        hours_reading: values.hoursReading,
      },
      { onSuccess: () => { notifySuccess("Recolección programada"); onOpenChange(false); } }
    );
  });

  return (
    <FormDialog
      isPending={createDelivery.isPending}
      open={open}
      onOpenChange={onOpenChange}
      width="md"
      title="¿Programar Recolección?"
      description={
        <span className="flex items-start gap-2">
          <FleetIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span>La entrega de {forkliftName} se completó. ¿Deseas programar la recolección?</span>
        </span>
      }
    >
      {!showForm ? (
        <FormDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={() => setShowForm(true)}>
            <FleetIcon className="h-4 w-4 mr-2" /> Programar Recolección
          </Button>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Omitir por Ahora</Button>
        </FormDialogFooter>
      ) : (
        <Form {...form}>
          <form onSubmit={handleSchedule} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">Fecha de Recolección</p><p className="font-medium">{bookingEndDate}</p></div>
              <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">Recolección</p></div>
            </div>
            <TextField control={form.control} name="address" label="Dirección de Recolección" placeholder="Ingresa la dirección" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField control={form.control} name="driverName" label="Nombre del Operador" />
              <TextField control={form.control} name="driverPhone" label="Teléfono del Operador" type="tel" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField control={form.control} name="scheduledTime" label="Hora Programada" type="time" />
              <NumberField control={form.control} name="hoursReading" label="Horómetro (hrs)" min={0} step={0.1} placeholder="Ej: 1250" />
            </div>
            <TextareaField control={form.control} name="notes" label="Notas" rows={2} />

            <FormDialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Omitir</Button>
              <Button type="submit" disabled={createDelivery.isPending}>
                {createDelivery.isPending ? "Programando..." : "Programar Recolección"}
              </Button>
            </FormDialogFooter>
          </form>
        </Form>
      )}
    </FormDialog>
  );
}
