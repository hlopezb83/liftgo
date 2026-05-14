import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck } from "lucide-react";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { DragDropImageUploader } from "@/components/DragDropImageUploader";
import { INSPECTION_CONDITIONS, FUEL_LEVELS, STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import type { Booking } from "@/hooks/useBookings";
import type { Forklift } from "@/hooks/useForklifts";

export interface ReturnInspectionFormState {
  bookingId: string;
  inspectedAt: Date;
  condition: string;
  damageNotes: string;
  damageCost: string;
  hoursUsed: string;
  fuelLevel: string;
  inspectedBy: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ReturnInspectionFormState;
  set: <K extends keyof ReturnInspectionFormState>(k: K, v: ReturnInspectionFormState[K]) => void;
  activeBookings?: Booking[];
  forkliftMap: Map<string, Forklift>;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function ReturnInspectionDialog({
  open, onOpenChange, form, set, activeBookings, forkliftMap, isPending, onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Inspección de Devolución
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Reserva a Devolver *</Label>
            <Select value={form.bookingId} onValueChange={(v) => set("bookingId", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar reserva activa" /></SelectTrigger>
              <SelectContent>
                {activeBookings?.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {forkliftMap.get(b.forklift_id)?.name} — {b.customer_name || "Desconocido"} ({formatDateRange(b.start_date, b.end_date)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Solo se muestran reservas cuyo periodo de renta ha finalizado. Si no encuentras la reserva, verifica que la fecha de fin ya haya pasado o{" "}
              <a href="/bookings" className="underline text-primary hover:text-primary/80 transition-colors">
                edita la reserva
              </a>{" "}
              para ajustar las fechas antes de registrar la devolución.
            </p>
          </div>
          <DatePickerField label="Fecha de Inspección" date={form.inspectedAt} onSelect={(d) => set("inspectedAt", d || new Date())} required />
          <div className="space-y-1.5">
            <Label>Condición *</Label>
            <Select value={form.condition} onValueChange={(v) => set("condition", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INSPECTION_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">{STATUS_LABELS[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notas de Daños</Label>
            <Textarea value={form.damageNotes} onChange={(e) => set("damageNotes", e.target.value)} placeholder="Describe cualquier daño..." rows={3} />
          </div>
          {form.bookingId && (() => {
            const selectedBooking = activeBookings?.find((b) => b.id === form.bookingId);
            if (!selectedBooking) return null;
            return (
              <div className="space-y-1.5">
                <Label>Fotos de Inspección</Label>
                <DragDropImageUploader entityType="return_inspection" entityId={selectedBooking.forklift_id} maxFiles={8} />
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Costo por Daños ($)</Label>
              <Input type="number" step="0.01" value={form.damageCost} onChange={(e) => set("damageCost", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Horas de Uso</Label>
              <Input type="number" step="0.1" value={form.hoursUsed} onChange={(e) => set("hoursUsed", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nivel de Combustible</Label>
              <Select value={form.fuelLevel} onValueChange={(v) => set("fuelLevel", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {FUEL_LEVELS.map((l) => (
                    <SelectItem key={l} value={l}>{FUEL_LEVEL_LABELS[l] || l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Inspeccionado Por</Label>
              <Input value={form.inspectedBy} onChange={(e) => set("inspectedBy", e.target.value)} placeholder="Nombre del inspector" />
            </div>
          </div>
          <FormActions submitLabel="Completar Devolución" isPending={isPending} onCancel={() => onOpenChange(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
