import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { SupplierSelector } from "@/components/suppliers/SupplierSelector";
import { Wrench } from "lucide-react";
import { SERVICE_TYPES } from "@/lib/constants";

export type MaintenanceFormShape = {
  forkliftId: string;
  serviceType: string;
  description: string;
  cost: string;
  performedBy: string;
  performedAt: Date;
  nextServiceDate: Date | undefined;
  supplierId: string;
};

interface ForkliftOption { id: string; name: string; model: string }
interface MechanicOption { id: string; name: string; specialization?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEdit: boolean;
  isPending: boolean;
  form: MaintenanceFormShape;
  set: <K extends keyof MaintenanceFormShape>(key: K, value: MaintenanceFormShape[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
  forklifts: ForkliftOption[] | undefined;
  mechanics: MechanicOption[] | undefined;
}

export function MaintenanceFormDialog({
  open, onOpenChange, isEdit, isPending, form, set, onSubmit, forklifts, mechanics,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            {isEdit ? "Editar Mantenimiento" : "Registrar Mantenimiento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Montacargas *</Label>
            <Select value={form.forkliftId} onValueChange={(v) => set("forkliftId", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar montacargas" /></SelectTrigger>
              <SelectContent>
                {forklifts?.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de Servicio *</Label>
            <Select value={form.serviceType} onValueChange={(v) => set("serviceType", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar tipo de servicio" /></SelectTrigger>
              <SelectContent>
                {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Detalles del servicio..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Costo ($)</Label>
              <Input type="number" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Realizado Por</Label>
              <Select value={form.performedBy} onValueChange={(v) => set("performedBy", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar mecánico" /></SelectTrigger>
                <SelectContent>
                  {mechanics?.map((m) => (
                    <SelectItem key={m.id} value={m.name}>
                      {m.name}{m.specialization ? ` (${m.specialization})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DatePickerField label="Fecha de Servicio" date={form.performedAt} onSelect={(d) => d && set("performedAt", d)} />
            <DatePickerField label="Próximo Servicio" date={form.nextServiceDate} onSelect={(d) => set("nextServiceDate", d)} placeholder="Opcional" />
          </div>
          <SupplierSelector value={form.supplierId} onChange={(v) => set("supplierId", v)} />
          <FormActions
            submitLabel={isEdit ? "Guardar Cambios" : "Agregar Registro"}
            isPending={isPending}
            onCancel={() => onOpenChange(false)}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
