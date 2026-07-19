import type { FormEvent as ReactFormEvent } from "react";
import {
  TextareaField,
  SelectField,
  DateField,
  CurrencyField,
  SupplierField,
} from "@/components/forms/fields";
import { FormActions } from "@/components/forms/FormActions";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormSection } from "@/components/forms/FormSection";
import { Form } from "@/components/ui/form";
import { SERVICE_TYPES } from "@/lib/constants";
import type { MaintenanceFormValues } from "../../hooks/maintenance/useMaintenanceForm";
import type { UseFormReturn } from "react-hook-form";

interface ForkliftOption { id: string; name: string; model: string }
interface MechanicOption { id: string; name: string; specialization?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEdit: boolean;
  isPending: boolean;
  form: UseFormReturn<MaintenanceFormValues>;
  onSubmit: (e: ReactFormEvent) => void;
  forklifts: ForkliftOption[] | undefined;
  mechanics: MechanicOption[] | undefined;
}

export function MaintenanceFormDialog({
  open, onOpenChange, isEdit, isPending, form, onSubmit, forklifts, mechanics,
}: Props) {
  const forkliftOptions = (forklifts ?? []).map((f) => ({
    value: f.id,
    label: `${f.name} — ${f.model}`,
  }));
  const serviceTypeOptions = SERVICE_TYPES.map((s) => ({ value: s, label: s }));
  const mechanicOptions = (mechanics ?? []).map((m) => ({
    value: m.name,
    label: m.specialization ? `${m.name} (${m.specialization})` : m.name,
  }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar Mantenimiento" : "Registrar Mantenimiento"}
    >
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-4">
          <FormSection title="Equipo y servicio" first>
            <SelectField
              control={form.control}
              name="forkliftId"
              label="Montacargas"
              options={forkliftOptions}
              placeholder="Seleccionar montacargas"
              required
            />
            <SelectField
              control={form.control}
              name="serviceType"
              label="Tipo de Servicio"
              options={serviceTypeOptions}
              placeholder="Seleccionar tipo de servicio"
              required
            />
            <TextareaField
              control={form.control}
              name="description"
              label="Descripción"
              placeholder="Detalles del servicio..."
              rows={3}
            />
          </FormSection>

          <FormSection title="Ejecución y costo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurrencyField control={form.control} name="cost" label="Costo" />
              <SelectField
                control={form.control}
                name="performedBy"
                label="Realizado Por"
                options={mechanicOptions}
                placeholder="Seleccionar mecánico"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DateField control={form.control} name="performedAt" label="Fecha de Servicio" />
              <DateField control={form.control} name="nextServiceDate" label="Próximo Servicio" placeholder="Opcional" />
            </div>
            <SupplierField control={form.control} name="supplierId" allowEmpty />
          </FormSection>

          <FormDialogFooter>
            <FormActions
              submitLabel={isEdit ? "Guardar Cambios" : "Agregar Registro"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </FormDialogFooter>
        </form>
      </Form>
    </FormDialog>
  );
}
