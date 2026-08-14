import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import {
  TextField, TextareaField, DateField, SelectField, CheckboxField, type SelectOption,
} from "@/components/forms/fields";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { formatDateRange } from "@/lib/utils";
import type { UseFormReturn } from "react-hook-form";

export type DeliveryFormValues = {
  forkliftId: string; bookingId: string; type: string;
  alreadyCompleted: boolean;
  scheduledDate: Date; scheduledTime: string;
  address: string; driverName: string; driverPhone: string; notes: string;
};

type Forklift = { id: string; name: string; model: string };
type Booking = { id: string; customer_name: string | null; start_date: string; end_date: string; forklift_id: string; status: string };
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

/**
 * R-C6 + F9: reservas seleccionables para una entrega. Sólo las `confirmed`
 * (canceladas/completadas son terminales) y, si ya hay montacargas elegido,
 * sólo las de ese equipo — el RPC rechaza cualquier otra combinación.
 */
export function selectableBookings(
  bookings: Booking[] | undefined,
  forkliftId: string | undefined,
): Booking[] | undefined {
  const active = bookings?.filter((b) => b.status === "confirmed");
  return forkliftId ? active?.filter((b) => b.forklift_id === forkliftId) : active;
}

export function DeliveryFormFields({ form, forklifts, bookings, activeDrivers }: Props) {
  const forkliftId = useWatch({ control: form.control, name: "forkliftId" });
  const bookingId = useWatch({ control: form.control, name: "bookingId" });

  const visibleBookings = selectableBookings(bookings, forkliftId);

  const forkliftOptions: SelectOption[] =
    forklifts?.map((f) => ({ value: f.id, label: `${f.name} — ${f.model}` })) ?? [];

  const bookingOptions: SelectOption[] =
    visibleBookings?.map((b) => ({
      value: b.id,
      label: `${b.customer_name || "Desconocido"} (${formatDateRange(b.start_date, b.end_date)})`,
    })) ?? [];

  const driverOptions: SelectOption[] =
    activeDrivers?.map((d) => ({ value: d.name, label: d.name })) ?? [];

  // Auto-rellena el teléfono cuando cambia el operador seleccionado.
  const driverName = useWatch({ control: form.control, name: "driverName" });
  useEffect(() => {
    if (!driverName) return;
    const driver = activeDrivers?.find((d) => d.name === driverName);
    if (driver?.phone) form.setValue("driverPhone", driver.phone, { shouldDirty: true });
  }, [driverName, activeDrivers, form]);

  // R-C6: al elegir una reserva, auto-asignar su montacargas.
  useEffect(() => {
    if (!bookingId) return;
    const booking = bookings?.find((b) => b.id === bookingId);
    if (booking && booking.forklift_id !== forkliftId) {
      form.setValue("forkliftId", booking.forklift_id, { shouldDirty: true });
    }
  }, [bookingId, bookings, forkliftId, form]);

  // R-C6: si el montacargas cambia y ya no coincide con la reserva, limpiar.
  useEffect(() => {
    if (!bookingId || !forkliftId) return;
    const booking = bookings?.find((b) => b.id === bookingId);
    if (booking && booking.forklift_id !== forkliftId) {
      form.setValue("bookingId", "", { shouldDirty: true });
    }
  }, [forkliftId, bookingId, bookings, form]);




  return (
    <Form {...form}>
      <FormSection title="Detalles" first>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          // GUI-FE-11a (G-DIS-03): la regla exige reserva; el placeholder
          // "Opcional" contradecía la validación.
          required
          placeholder="Seleccionar reserva"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DateField control={form.control} name="scheduledDate" label="Fecha" required />
          <TextField control={form.control} name="scheduledTime" label="Hora" type="time" />
        </div>

        <CheckboxField
          control={form.control}
          name="alreadyCompleted"
          label="Ya se realizó (registrar histórico)"
          description="Permite fecha pasada; la entrega se registra directamente como completada."
        />

        <TextField
          control={form.control}
          name="address"
          label="Dirección de Entrega"
          placeholder="Av. Reforma 123, CDMX"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
