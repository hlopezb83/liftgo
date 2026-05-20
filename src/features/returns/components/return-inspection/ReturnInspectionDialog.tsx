import type { UseFormReturn } from "react-hook-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck } from "lucide-react";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { DragDropImageUploader } from "@/components/DragDropImageUploader";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { INSPECTION_CONDITIONS, FUEL_LEVELS, STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import { formatDateRange } from "@/lib/utils";
import type { Booking } from "@/features/bookings/hooks/useBookings";
import type { Forklift } from "@/features/fleet/hooks/forklifts/useForklifts";
import type { ReturnInspectionFormValues } from "@/features/returns/hooks/returnInspection/useReturnInspectionDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<ReturnInspectionFormValues>;
  activeBookings?: Booking[];
  forkliftMap: Map<string, Forklift>;
  isPending: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function ReturnInspectionDialog({
  open, onOpenChange, form, activeBookings, forkliftMap, isPending, onSubmit,
}: Props) {
  const bookingId = form.watch("bookingId");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Inspección de Devolución
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField control={form.control} name="bookingId" render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel>Reserva a Devolver *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar reserva activa" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {activeBookings?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {forkliftMap.get(b.forklift_id)?.name} — {b.customer_name || "Desconocido"} ({formatDateRange(b.start_date, b.end_date)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Solo se muestran reservas cuyo periodo de renta ha finalizado. Si no encuentras la reserva, verifica que la fecha de fin ya haya pasado o{" "}
                  <a href="/bookings" className="underline text-primary hover:text-primary/80 transition-colors">
                    edita la reserva
                  </a>{" "}
                  para ajustar las fechas antes de registrar la devolución.
                </p>
              </FormItem>
            )} />

            <FormField control={form.control} name="inspectedAt" render={({ field }) => (
              <FormItem>
                <DatePickerField label="Fecha de Inspección" date={field.value} onSelect={(d) => field.onChange(d || new Date())} required />
              </FormItem>
            )} />

            <FormField control={form.control} name="condition" render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel>Condición *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {INSPECTION_CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{STATUS_LABELS[c] || c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="damageNotes" render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel>Notas de Daños</FormLabel>
                <FormControl><Textarea {...field} placeholder="Describe cualquier daño..." rows={3} /></FormControl>
              </FormItem>
            )} />

            {bookingId && (() => {
              const selectedBooking = activeBookings?.find((b) => b.id === bookingId);
              if (!selectedBooking) return null;
              return (
                <div className="space-y-1.5">
                  <FormLabel>Fotos de Inspección</FormLabel>
                  <DragDropImageUploader entityType="return_inspection" entityId={selectedBooking.forklift_id} maxFiles={8} />
                </div>
              );
            })()}

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="damageCost" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Costo por Daños ($)</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} placeholder="0" /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="hoursUsed" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Horas de Uso</FormLabel>
                  <FormControl><Input type="number" step="0.1" {...field} placeholder="0" /></FormControl>
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="fuelLevel" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Nivel de Combustible</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {FUEL_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{FUEL_LEVEL_LABELS[l] || l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )} />
              <FormField control={form.control} name="inspectedBy" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel>Inspeccionado Por</FormLabel>
                  <FormControl><Input {...field} placeholder="Nombre del inspector" /></FormControl>
                </FormItem>
              )} />
            </div>

            <FormActions submitLabel="Completar Devolución" isPending={isPending} onCancel={() => onOpenChange(false)} />
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
