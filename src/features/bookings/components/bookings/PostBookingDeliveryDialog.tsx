import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Truck, CheckCircle2 } from "lucide-react";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { NumberField, TextField, TextareaField } from "@/components/forms/fields";
import { useCreateDelivery } from "@/features/deliveries";

interface PostBookingDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  forkliftId: string;
  forkliftName: string;
  startDate: string;
  customerAddress: string | null;
  onSkip: () => void;
  currentIndex?: number;
  totalCount?: number;
}

const schema = z.object({
  address: z.string().default(""),
  driverName: z.string().default(""),
  driverPhone: z.string().default(""),
  scheduledTime: z.string().default(""),
  hoursReading: z.number().min(0).nullable().default(null),
  notes: z.string().default(""),
});
type FormValues = z.infer<typeof schema>;

export function PostBookingDeliveryDialog({
  open, onOpenChange, bookingId, forkliftId, forkliftName, startDate, customerAddress, onSkip,
  currentIndex = 0, totalCount = 1,
}: PostBookingDeliveryDialogProps) {
  const createDelivery = useCreateDelivery();
  const [showForm, setShowForm] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      address: customerAddress || "", driverName: "", driverPhone: "",
      scheduledTime: "", hoursReading: null, notes: "",
    },
  });

  useEffect(() => {
    if (!open) { setShowForm(false); }
    if (open) {
      form.reset({
        address: customerAddress || "", driverName: "", driverPhone: "",
        scheduledTime: "", hoursReading: null, notes: "",
      });
    }
  }, [open, customerAddress, form]);

  const handleSchedule = form.handleSubmit((values) => {
    createDelivery.mutate(
      {
        forklift_id: forkliftId,
        booking_id: bookingId,
        scheduled_date: startDate,
        scheduled_time: values.scheduledTime || null,
        address: values.address || null,
        driver_name: values.driverName || null,
        driver_phone: values.driverPhone || null,
        notes: values.notes || null,
        type: "delivery",
        hours_reading: values.hoursReading,
      },
      { onSuccess: () => { notifySuccess("Entrega programada"); onSkip(); } }
    );
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { if (!o) onSkip(); onOpenChange(o); }}
      width="md"
      title={totalCount > 1 ? `Entrega ${currentIndex + 1} de ${totalCount}` : "Reserva Creada"}
      description={
        <span className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <span>¿Deseas programar la entrega de {forkliftName}?</span>
        </span>
      }
    >
      {!showForm ? (
        <FormDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={() => setShowForm(true)}>
            <Truck className="h-4 w-4 mr-2" /> Programar Entrega
          </Button>
          <Button variant="outline" className="w-full" onClick={onSkip}>Omitir por Ahora</Button>
        </FormDialogFooter>
      ) : (
        <Form {...form}>
          <form onSubmit={handleSchedule} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{startDate}</p></div>
              <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">Entrega</p></div>
            </div>
            <TextField control={form.control} name="address" label="Dirección de Entrega" placeholder="Ingresa la dirección" />
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="driverName" label="Nombre del Operador" placeholder="Opcional" />
              <TextField control={form.control} name="driverPhone" label="Teléfono del Operador" placeholder="Opcional" type="tel" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField control={form.control} name="scheduledTime" label="Hora Programada" type="text" />
              <NumberField control={form.control} name="hoursReading" label="Horómetro (hrs)" min={0} step={0.1} placeholder="Ej: 1250" />
            </div>
            <TextareaField control={form.control} name="notes" label="Notas" rows={2} placeholder="Notas de entrega opcionales" />

            <FormDialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={onSkip}>Omitir</Button>
              <Button type="submit" disabled={createDelivery.isPending}>
                {createDelivery.isPending ? "Programando..." : "Programar Entrega"}
              </Button>
            </FormDialogFooter>
          </form>
        </Form>
      )}
    </FormDialog>
  );
}
