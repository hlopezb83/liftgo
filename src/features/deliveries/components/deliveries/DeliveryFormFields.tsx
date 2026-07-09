import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { formatDateRange } from "@/lib/utils";
import { Form } from "@/components/ui/form";
import { FormSection } from "@/components/forms/FormSection";
import {
  TextField, TextareaField, DateField, SelectField, type SelectOption,
} from "@/components/forms/fields";

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

const TYPE_OPTIONS: SelectOption[] = [
  { value: "delivery", label: "Entrega" },
  { value: "pickup", label: "Recolección" },
];

export function DeliveryFormFields({ form, forklifts, bookings, activeDrivers }: Props) {
  const forkliftOptions: SelectOption[] =
    forklifts?.map((f) => ({ value: f.id, label: `${f.name} — ${f.model}` })) ?? [];

  const bookingOptions: SelectOption[] =
    bookings?.map((b) => ({
      value: b.id,
      label: `${b.customer_name || "Desconocido"} (${formatDateRange(b.start_date, b.end_date)})`,
    })) ?? [];

  const driverOptions: SelectOption[] =
    activeDrivers?.map((d) => ({ value: d.name, label: d.name })) ?? [];

  // Auto-rellena el teléfono cuando cambia el operador seleccionado.
  const driverName = form.watch("driverName");
  useEffect(() => {
    if (!driverName) return;
    const driver = activeDrivers?.find((d) => d.name === driverName);
    if (driver?.phone) form.setValue("driverPhone", driver.phone, { shouldDirty: true });
  }, [driverName, activeDrivers, form]);


  return (
    <Form {...form}>
      <FormSection title="Detalles" first>
        <div className="grid grid-cols-2 gap-4">
          <SelectField control={form.control} name="type" label="Tipo" required options={TYPE_OPTIONS} />
          <SelectField
            control={form.control}
            name="forkliftId"
            label="Montacargas"
            required
            options={forkliftOptions}
            placeholder="Seleccionar"
          />
        </div>

        <SelectField
          control={form.control}
          name="bookingId"
          label="Reserva Vinculada"
          options={bookingOptions}
          placeholder="Opcional"
        />

        <div className="grid grid-cols-2 gap-4">
          <DateField control={form.control} name="scheduledDate" label="Fecha" required />
          <TextField control={form.control} name="scheduledTime" label="Hora" type="time" />
        </div>

        <TextField
          control={form.control}
          name="address"
          label="Dirección de Entrega"
          placeholder="Av. Reforma 123, CDMX"
        />

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            control={form.control}
            name="driverName"
            label="Operador"
            options={driverOptions}
            placeholder="Seleccionar operador"
          />
          <TextField
            control={form.control}
            name="driverPhone"
            label="Teléfono del Operador"
            placeholder="+52 55 1234 5678"
          />
        </div>

        <TextareaField
          control={form.control}
          name="notes"
          label="Notas"
          rows={2}
          placeholder="Instrucciones especiales..."
        />
      </FormSection>
    </Form>
  );
}
