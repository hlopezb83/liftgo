import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { FormSection } from "@/components/forms/FormSection";
import { RequiredMark } from "@/components/forms/RequiredMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MaintenancePolicyFormValues } from "./maintenancePolicyFormTypes";


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isEdit: boolean;
  isPending: boolean;
  form: MaintenancePolicyFormValues;
  availableForklifts: Array<{ id: string; name: string; model: string }> | undefined;
  optionsLoading: boolean;
  optionsError: boolean;
  optionsLimitMessage?: string;
  onRetryOptions: () => void;
  canSave: boolean;
  onChange: (key: keyof MaintenancePolicyFormValues, value: string) => void;
  onSave: () => void;
  /** E4: pide confirmación al cerrar si hay cambios sin guardar. */
  isDirty?: boolean;
}

export function MaintenancePolicyForm({
  open, onOpenChange, isEdit, isPending, form, availableForklifts, onChange, onSave, isDirty = false, optionsLoading, optionsError, optionsLimitMessage, onRetryOptions, canSave,
}: Props) {
  return (
    <FormDialog
      isPending={isPending}
      isDirty={isDirty}
      open={open}
      onOpenChange={onOpenChange}
      title={`${isEdit ? "Editar" : "Nueva"} Póliza de Mantenimiento`}
      width="md"
    >
      <FormSection title="Equipo y proveedor" first>
        <div className="space-y-1.5">
          <Label>Montacargas <RequiredMark /></Label>
          <Select disabled={isPending || optionsLoading || optionsError} value={form.forklift_id} onValueChange={(v) => onChange("forklift_id", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar montacargas rentado" /></SelectTrigger>
            <SelectContent>
              {availableForklifts?.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {optionsError ? (
            optionsLimitMessage ? (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{optionsLimitMessage}</p>
                <Button type="button" variant="outline" onClick={onRetryOptions}>Reintentar</Button>
              </div>
            ) : <QueryErrorState bare entity="los montacargas para la póliza" onRetry={onRetryOptions} />
          ) : optionsLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Verificando montacargas…</p>
          ) : availableForklifts?.length === 0 ? (
            <p role="status" className="text-sm text-muted-foreground">No hay montacargas rentados sin póliza disponibles.</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Proveedor <RequiredMark /></Label>
          <Input value={form.provider_name} onChange={(e) => onChange("provider_name", e.target.value)} placeholder="Nombre del proveedor externo" />
        </div>
      </FormSection>
      <FormSection title="Condiciones">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Costo Mensual ($)</Label>
            <Input type="number" value={form.monthly_cost} onChange={(e) => onChange("monthly_cost", e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de Servicio</Label>
            <Input value={form.service_type} onChange={(e) => onChange("service_type", e.target.value)} placeholder="Póliza de Mantenimiento" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Descripción</Label>
          <Textarea value={form.description} onChange={(e) => onChange("description", e.target.value)} rows={2} placeholder="Detalles de la póliza…" />
        </div>
      </FormSection>
      <FormDialogFooter>
        <FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={isPending} />
        <Button onClick={onSave} disabled={isPending || !canSave}>
          {isEdit ? "Guardar" : "Agregar póliza"}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
