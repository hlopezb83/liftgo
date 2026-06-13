import type { UseFormReturn } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { SupplierSelector } from "@/features/suppliers";
import { Wrench } from "lucide-react";
import { SERVICE_TYPES } from "@/lib/constants";
import type { MaintenanceFormValues } from "../../hooks/maintenance/useMaintenanceForm";

interface ForkliftOption { id: string; name: string; model: string }
interface MechanicOption { id: string; name: string; specialization?: string | null }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEdit: boolean;
  isPending: boolean;
  form: UseFormReturn<MaintenanceFormValues>;
  onSubmit: (e: React.FormEvent) => void;
  forklifts: ForkliftOption[] | undefined;
  mechanics: MechanicOption[] | undefined;
}

export function MaintenanceFormDialog({
  open, onOpenChange, isEdit, isPending, form, onSubmit, forklifts, mechanics,
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
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField control={form.control} name="forkliftId" render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel>Montacargas *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar montacargas" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {forklifts?.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="serviceType" render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel>Tipo de Servicio *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar tipo de servicio" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel>Descripción</FormLabel>
                <FormControl><Textarea {...field} placeholder="Detalles del servicio..." rows={3} /></FormControl>
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="cost" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Costo ($)</FormLabel>
                  <FormControl><Input type="number" {...field} placeholder="0" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="performedBy" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Realizado Por</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar mecánico" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {mechanics?.map((m) => (
                        <SelectItem key={m.id} value={m.name}>
                          {m.name}{m.specialization ? ` (${m.specialization})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="performedAt" render={({ field }) => (
                <FormItem>
                  <DatePickerField label="Fecha de Servicio" date={field.value} onSelect={(d) => d && field.onChange(d)} />
                </FormItem>
              )} />
              <FormField control={form.control} name="nextServiceDate" render={({ field }) => (
                <FormItem>
                  <DatePickerField label="Próximo Servicio" date={field.value} onSelect={(d) => field.onChange(d)} placeholder="Opcional" />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="supplierId" render={({ field }) => (
              <FormItem>
                <SupplierSelector value={field.value} onChange={field.onChange} />
              </FormItem>
            )} />
            <FormActions
              submitLabel={isEdit ? "Guardar Cambios" : "Agregar Registro"}
              isPending={isPending}
              onCancel={() => onOpenChange(false)}
            />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
