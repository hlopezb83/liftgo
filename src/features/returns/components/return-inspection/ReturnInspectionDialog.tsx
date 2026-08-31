import { useWatch, type UseFormReturn } from "react-hook-form";
import { DragDropImageUploader } from "@/components/forms/DragDropImageUploader";
import {
  SelectField,
  TextField,
  TextareaField,
  DateField,
  type SelectOption,
} from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog } from "@/components/forms/FormDialog";
import { ClipboardCheck } from "@/components/icons";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import type { Booking } from "@/features/bookings";
import type { Forklift } from "@/features/fleet";
import { INSPECTION_CONDITIONS, FUEL_LEVELS, STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import { formatDateRange } from "@/lib/utils";
import { DAMAGE_CONDITIONS } from "../../lib/returnInspectionSchema";
import type { ReturnInspectionFormValues } from "../../hooks/returnInspection/useReturnInspectionDialog";
import type { FormEvent as ReactFormEvent } from "react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<ReturnInspectionFormValues>;
  activeBookings?: Booking[];
  forkliftMap: Map<string, Forklift>;
  isPending: boolean;
  onSubmit: (e: ReactFormEvent) => void;
}

export function ReturnInspectionDialog({
  open, onOpenChange, form, activeBookings, forkliftMap, isPending, onSubmit,
}: Props) {
  const bookingId = useWatch({ control: form.control, name: "bookingId" });
  // R7-FE-07a (N7-UX-01): señalar la obligatoriedad ANTES del submit
  // (asterisco + descripción), no sólo aria-invalid después.
  const conditionValue = useWatch({ control: form.control, name: "condition" });
  const isDamageCondition = DAMAGE_CONDITIONS.includes(conditionValue);

  const bookingOptions: SelectOption[] =
    activeBookings?.map((b) => ({
      value: b.id,
      label: `${forkliftMap.get(b.forklift_id)?.name ?? ""} — ${b.customer_name || "Desconocido"} (${formatDateRange(b.start_date, b.end_date)})`,
    })) ?? [];

  const conditionOptions: SelectOption[] = INSPECTION_CONDITIONS.map((c) => ({
    value: c, label: STATUS_LABELS[c] || c,
  }));
  const fuelOptions: SelectOption[] = FUEL_LEVELS.map((l) => ({
    value: l, label: FUEL_LEVEL_LABELS[l] || l,
  }));

  const selectedBooking = bookingId ? activeBookings?.find((b) => b.id === bookingId) : undefined;

  return (
    <FormDialog
      isPending={isPending}
      open={open}
      onOpenChange={onOpenChange}
      title="Inspección de Devolución"
      description={
        <span className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" /> Registra el retorno del equipo y su condición
        </span>
      }
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <SelectField
            control={form.control}
            name="bookingId"
            label="Reserva a Devolver"
            required
            placeholder="Seleccionar reserva activa"
            options={bookingOptions}
            description="Solo se muestran reservas cuyo periodo de renta ha finalizado (o rentas vigentes si vienes del flujo de devolución anticipada). Si no encuentras la reserva, verifica la fecha de fin o ajústala en el módulo de reservas."
          />

          <DateField
            control={form.control}
            name="inspectedAt"
            disabledMatcher={{ after: new Date() }}
            disabledMatcher={{ after: new Date() }}
            label="Fecha de Inspección"
            required
          />

          <SelectField
            control={form.control}
            name="condition"
            label="Condición"
            required
            options={conditionOptions}
          />

          <TextareaField
            control={form.control}
            name="damageNotes"
            label="Notas de Daños"
            placeholder="Describe cualquier daño…"
            rows={3}
            description="Obligatorio si la condición indica daño (daño menor, daño mayor o necesita reparación)."
          />

          {selectedBooking && (
            <div className="space-y-1.5">
              <Label>Fotos de Inspección</Label>
              <DragDropImageUploader
                entityType="return_inspection"
                entityId={selectedBooking.forklift_id}
                maxFiles={8}
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextField
              control={form.control}
              name="damageCost"
              label="Costo por Daños ($)"
              type="number"
              placeholder="0"
              required={isDamageCondition}
              description={
                isDamageCondition
                  ? "Obligatorio cuando la condición indica daño (usa 0 si no aplica cargo)."
                  : undefined
              }
            />
            <TextField
              control={form.control}
              name="hoursUsed"
              label="Horas de Uso"
              type="text"
              placeholder="0"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SelectField
              control={form.control}
              name="fuelLevel"
              label="Nivel de Combustible"
              options={fuelOptions}
              placeholder="Seleccionar"
            />
            <TextField
              control={form.control}
              name="inspectedBy"
              label="Inspeccionado Por"
              placeholder="Nombre del inspector"
            />
          </div>

          <FormActions
            submitLabel="Completar Devolución"
            isPending={isPending}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
