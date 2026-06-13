import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { Form, FormField, FormItem, FormControl, FormLabel, FormMessage } from "@/components/ui/form";
import { formatDateRange } from "@/lib/utils";

export type DeliveryFormValues = {
  forkliftId: string; bookingId: string; type: string;
  scheduledDate: Date; scheduledTime: string;
  address: string; driverName: string; driverPhone: string; notes: string;
};

type Forklift = { id: string; name: string; model: string };
type Booking = { id: string; customer_name: string | null; start_date: string; end_date: string };
type Driver = { id: string; name: string; phone?: string | null };

interface Props {
  form: UseFormReturn<DeliveryFormValues>;
  forklifts: Forklift[] | undefined;
  bookings: Booking[] | undefined;
  activeDrivers: Driver[] | undefined;
}

export function DeliveryFormFields({ form, forklifts, bookings, activeDrivers }: Props) {
  return (
    <Form {...form}>
      <div className="space-y-4">
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
      </div>
    </Form>
  );
}
