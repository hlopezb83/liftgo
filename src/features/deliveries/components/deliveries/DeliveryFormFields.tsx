import { useEffect, useRef } from "react";
import { useWatch } from "react-hook-form";
import {
  TextField, TextareaField, DateField, SelectField, CheckboxField, type SelectOption,
} from "@/components/forms/fields";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { toYMD } from "@/lib/format/dateFormats";
import { formatDateRange, nowMty, parseDateLocal } from "@/lib/utils";
import { suggestedDateAfterTransportTypeChange, suggestedScheduledTransportDate } from "../../lib/deliveryBookingDate";
import { selectableBookings } from "./selectableBookings";
import type { UseFormReturn } from "react-hook-form";

export type DeliveryFormValues = {
  forkliftId: string; bookingId: string; type: string;
  alreadyCompleted: boolean;
  scheduledDate: Date; scheduledTime: string;
  address: string; driverName: string; driverPhone: string; notes: string;
  /** Bug 3: justificación si se registra completada sin operador. */
  noEvidenceReason: string;
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

export function DeliveryFormFields({ form, forklifts, bookings, activeDrivers }: Props) {
  const forkliftId = useWatch({ control: form.control, name: "forkliftId" });
  const bookingId = useWatch({ control: form.control, name: "bookingId" });
  const transportType = useWatch({ control: form.control, name: "type" });
  const lastBookingId = useRef("");
  const lastTransportType = useRef(transportType);
  const lastSuggestedDate = useRef<string | null>(null);
  // Bug 3: histórico sin operador → pedir justificación de evidencia.
  const alreadyCompleted = useWatch({ control: form.control, name: "alreadyCompleted" });

  const visibleBookings = selectableBookings(bookings, forkliftId);

  const forkliftOptions: SelectOption[] =
    forklifts?.map((f) => ({ value: f.id, label: `${f.name} — ${f.model}` })) ?? [];

  const bookingOptions: SelectOption[] =
    visibleBookings?.map((b) => ({
      value: b.id,
      label: `${b.customer_name || "Desconocido"} (${formatDateRange(b.start_date, b.end_date)})`,
    })) ?? [];

  const driverName = useWatch({ control: form.control, name: "driverName" });

  const selectBooking = (id: string) => {
    const booking = bookings?.find((b) => b.id === id);
    if (booking) form.setValue("forkliftId", booking.forklift_id, { shouldDirty: true });
  };
  const selectForklift = (id: string) => {
    const booking = bookings?.find((b) => b.id === form.getValues("bookingId"));
    if (booking && booking.forklift_id !== id) {
      form.setValue("bookingId", "", { shouldDirty: true, shouldValidate: true });
    }
  };

  // Al elegir otra reserva, proponer una fecha válida sin pisar una fecha ya válida.
  useEffect(() => {
    if (!bookingId) {
      lastBookingId.current = "";
      lastSuggestedDate.current = null;
      return;
    }
    if (lastBookingId.current === bookingId) return;
    const booking = bookings?.find((b) => b.id === bookingId);
    if (!booking) return;
    lastBookingId.current = bookingId;

    const suggestedDate = suggestedScheduledTransportDate(
      form.getValues("type"),
      toYMD(form.getValues("scheduledDate")),
      booking,
      toYMD(nowMty()),
      form.getValues("alreadyCompleted"),
    );
    lastSuggestedDate.current = suggestedDate;
    if (suggestedDate) {
      form.setValue("scheduledDate", parseDateLocal(suggestedDate), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [bookingId, bookings, form]);

  // Si cambia el tipo, mover sólo la fecha propuesta por este formulario.
  useEffect(() => {
    if (lastTransportType.current === transportType) return;
    lastTransportType.current = transportType;
    const booking = bookings?.find((b) => b.id === bookingId);
    if (!booking) return;

    const currentDate = toYMD(form.getValues("scheduledDate"));
    const suggestedDate = suggestedDateAfterTransportTypeChange(
      transportType,
      currentDate,
      lastSuggestedDate.current,
      booking,
      toYMD(nowMty()),
      form.getValues("alreadyCompleted"),
    );
    if (currentDate !== lastSuggestedDate.current) lastSuggestedDate.current = null;
    if (suggestedDate) {
      lastSuggestedDate.current = suggestedDate;
      form.setValue("scheduledDate", parseDateLocal(suggestedDate), {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [transportType, bookingId, bookings, form]);

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
            onValueChange={selectForklift}
            placeholder="Seleccionar"
          />
        </div>

        <SelectField
          control={form.control}
          name="bookingId"
          label="Reserva Vinculada"
          options={bookingOptions}
          onValueChange={selectBooking}
          // GUI-FE-11a (G-DIS-03): la regla exige reserva; el placeholder
          // "Opcional" contradecía la validación.
          required
          placeholder="Seleccionar reserva"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DateField control={form.control} name="scheduledDate" label={transportType === "pickup" ? "Fecha de recolección" : "Fecha de entrega"} required />
          <TextField control={form.control} name="scheduledTime" label="Hora" type="time" />
        </div>

        <CheckboxField
          control={form.control}
          name="alreadyCompleted"
          label="Ya se realizó (registrar histórico)"
          description="Permite fecha pasada; el transporte se registra directamente como completado."
        />

        <TextField
          control={form.control}
          name="address"
          label={transportType === "pickup" ? "Dirección de recolección" : "Dirección de entrega"}
          placeholder="Calle, número, colonia y ciudad"
        />

        <DeliveryOperatorFields form={form} activeDrivers={activeDrivers} />

        {/* Bug 3: histórico sin operador ni firma → justificación obligatoria. */}
        {alreadyCompleted && !driverName?.trim() && (
          <TextareaField
            control={form.control}
            name="noEvidenceReason"
            label="Justificación (sin operador ni firma)"
            rows={2}
            placeholder="Ej: Autorizó el supervisor Juan Pérez por teléfono"
            description="El transporte quedará completado sin evidencia operativa; registra quién lo autorizó."
          />
        )}

        <TextareaField
          control={form.control}
          name="notes"
          label="Notas"
          rows={2}
          placeholder="Instrucciones especiales…"
        />
      </FormSection>
    </Form>
  );
}

function DeliveryOperatorFields({ form, activeDrivers }: Pick<Props, "form" | "activeDrivers">) {
  const noDrivers = activeDrivers?.length === 0;
  const driverOptions = activeDrivers?.map((d) => ({ value: d.name, label: d.name })) ?? [];
  const selectDriver = (name: string) => {
    const driver = activeDrivers?.find((d) => d.name === name);
    form.setValue("driverPhone", driver?.phone ?? "", { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <SelectField
        control={form.control}
        name="driverName"
        label="Operador"
        options={driverOptions}
        onValueChange={selectDriver}
        disabled={noDrivers}
        placeholder={noDrivers ? "Sin operadores activos" : "Seleccionar operador"}
        description={noDrivers ? "No hay operadores activos registrados. Puedes asignar uno después." : undefined}
      />
      <TextField
        control={form.control}
        name="driverPhone"
        label="Teléfono del Operador"
        type="tel"
        placeholder="+52 55 1234 5678"
      />
    </div>
  );
}
