import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
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
  onChange: (key: keyof MaintenancePolicyFormValues, value: string) => void;
  onSave: () => void;
}

export function MaintenancePolicyForm({
  open, onOpenChange, isEdit, isPending, form, availableForklifts, onChange, onSave,
}: Props) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${isEdit ? "Editar" : "Nueva"} Póliza de Mantenimiento`}
      width="md"
    >
      <FormSection title="Equipo y proveedor" first>
        <div className="space-y-1.5">
          <Label>Montacargas <RequiredMark /></Label>
          <Select value={form.forklift_id} onValueChange={(v) => onChange("forklift_id", v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar montacargas rentado" /></SelectTrigger>
            <SelectContent>
              {availableForklifts?.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Proveedor <RequiredMark /></Label>
          <Input value={form.provider_name} onChange={(e) => onChange("provider_name", e.target.value)} placeholder="Nombre del proveedor externo" />
        </div>
      </FormSection>
      <FormSection title="Condiciones">
        <div className="grid grid-cols-2 gap-4">
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
          <Textarea value={form.description} onChange={(e) => onChange("description", e.target.value)} rows={2} placeholder="Detalles de la póliza..." />
        </div>
      </FormSection>
      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={onSave} disabled={isPending}>
          {isEdit ? "Guardar" : "Agregar póliza"}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
