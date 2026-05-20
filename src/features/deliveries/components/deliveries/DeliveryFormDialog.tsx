import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { Form, FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import { useCreateDelivery } from "@/features/deliveries/hooks/useDeliveries";
import { useActiveDrivers } from "@/features/fleet/hooks/useDrivers";
import { useForkliftMap } from "@/features/fleet/hooks/forklifts/useForkliftMap";
import { useBookings } from "@/features/bookings/hooks/useBookings";
import { TruckIcon, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateRange } from "@/lib/utils";

const deliverySchema = z.object({
  forkliftId: z.string().min(1, "Selecciona un montacargas"),
  bookingId: z.string(),
  type: z.string().min(1),
  scheduledDate: z.date({ required_error: "Fecha requerida" }),
  scheduledTime: z.string(),
  address: z.string(),
  driverName: z.string(),
  driverPhone: z.string(),
  notes: z.string(),
});
type DeliveryFormValues = z.infer<typeof deliverySchema>;

const initialForm: DeliveryFormValues = {
  forkliftId: "",
  bookingId: "",
  type: "delivery",
  scheduledDate: new Date(),
  scheduledTime: "",
  address: "",
  driverName: "",
  driverPhone: "",
  notes: "",
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
          toast.success("Transporte programado");
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Tipo *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="delivery">Entrega</SelectItem>
                        <SelectItem value="pickup">Recolección</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="forkliftId" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Montacargas *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {forklifts?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="bookingId" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Reserva Vinculada</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {bookings?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.customer_name || "Desconocido"} ({formatDateRange(b.start_date, b.end_date)})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="scheduledDate" render={({ field }) => (
                  <FormItem>
                    <DatePickerField label="Fecha *" date={field.value} onSelect={(d) => d && field.onChange(d)} />
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="scheduledTime" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Hora</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Dirección de Entrega</FormLabel>
                  <FormControl><Input {...field} placeholder="Av. Reforma 123, CDMX" /></FormControl>
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="driverName" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Operador</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        const driver = activeDrivers?.find((d) => d.name === v);
                        if (driver?.phone) form.setValue("driverPhone", driver.phone);
                      }}
                    >
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar operador" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {activeDrivers?.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="driverPhone" render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel>Teléfono del Operador</FormLabel>
                    <FormControl><Input {...field} placeholder="+52 55 1234 5678" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Textarea {...field} placeholder="Instrucciones especiales..." rows={2} /></FormControl>
                </FormItem>
              )} />

              <FormActions submitLabel="Programar" isPending={createDelivery.isPending} onCancel={() => setOpen(false)} />
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
