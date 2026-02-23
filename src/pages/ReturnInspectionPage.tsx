import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useBookings, useForklifts } from "@/hooks/useForkliftData";
import { useCreateReturnInspection, useReturnInspections } from "@/hooks/useReturnInspections";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { StatusBadge } from "@/components/StatusBadge";
import { FormActions } from "@/components/FormActions";
import { PostInspectionInvoiceDialog } from "@/components/PostInspectionInvoiceDialog";
import { useFormState } from "@/hooks/useFormState";
import { formatCurrency } from "@/lib/formatCurrency";
import { INSPECTION_CONDITIONS, FUEL_LEVELS, STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import { PlusCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const initialForm = {
  bookingId: "" as string,
  condition: "good" as string,
  damageNotes: "" as string,
  damageCost: "" as string,
  hoursUsed: "" as string,
  fuelLevel: "" as string,
  inspectedBy: "" as string,
};

interface InvoicePromptData {
  booking: { id: string; customer_name: string | null; customer_id: string | null; start_date: string; end_date: string; forklift_id: string };
  forklift: any;
  damageCost: number;
}

export default function ReturnInspectionPage() {
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: inspections, isLoading } = useReturnInspections();
  const createInspection = useCreateReturnInspection();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);
  const [invoicePrompt, setInvoicePrompt] = useState<InvoicePromptData | null>(null);

  const activeBookings = bookings?.filter(
    (b) => b.status === "confirmed" && !b.return_status
  );

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bookingId) { toast.error("Selecciona una reserva para devolver"); return; }
    const booking = bookings?.find((b) => b.id === form.bookingId);
    if (!booking) return;

    const damageCost = form.damageCost ? parseFloat(form.damageCost) : 0;

    createInspection.mutate(
      {
        booking_id: form.bookingId,
        forklift_id: booking.forklift_id,
        condition: form.condition,
        damage_notes: form.damageNotes || null,
        damage_cost: damageCost,
        hours_used: form.hoursUsed ? parseFloat(form.hoursUsed) : null,
        fuel_level: form.fuelLevel || null,
        inspected_by: form.inspectedBy || null,
      },
      {
        onSuccess: () => {
          toast.success("Inspección de devolución registrada — montacargas marcado como disponible");
          setDialogOpen(false);

          const fl = forkliftMap.get(booking.forklift_id);
          if (fl) {
            setInvoicePrompt({
              booking: {
                id: booking.id,
                customer_name: booking.customer_name,
                customer_id: booking.customer_id,
                start_date: booking.start_date,
                end_date: booking.end_date,
                forklift_id: booking.forklift_id,
              },
              forklift: fl,
              damageCost,
            });
          }
          reset();
        },
      }
    );
  };

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Devoluciones y Revisión"
        subtitle="Inspecciona equipos devueltos y actualiza el estado de la flota"
        action={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Nueva Devolución
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? <TableSkeleton /> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Montacargas</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Condición</TableHead>
                  <TableHead>Costo por Daños</TableHead>
                  <TableHead>Inspector</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections && inspections.length > 0 ? inspections.map((ins) => {
                  const insWithJoins = ins as typeof ins & { forklifts?: { name: string; model: string }; bookings?: { customer_name: string | null } };
                  return (
                  <TableRow key={ins.id}>
                    <TableCell className="font-mono text-sm">{format(new Date(ins.inspected_at), "d MMM yyyy", { locale: es })}</TableCell>
                    <TableCell className="font-medium">{insWithJoins.forklifts?.name || "—"}</TableCell>
                    <TableCell>{insWithJoins.bookings?.customer_name || "—"}</TableCell>
                    <TableCell><StatusBadge status={ins.condition} /></TableCell>
                    <TableCell className="font-mono">{ins.damage_cost ? formatCurrency(ins.damage_cost) : "—"}</TableCell>
                    <TableCell>{ins.inspected_by || "—"}</TableCell>
                  </TableRow>
                  );
                }) : (
                  <EmptyRow colSpan={6} message="No hay inspecciones de devolución" />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Inspección de Devolución
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Reserva a Devolver *</Label>
              <Select value={form.bookingId} onValueChange={(v) => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar reserva activa" /></SelectTrigger>
                <SelectContent>
                  {activeBookings?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {forkliftMap.get(b.forklift_id)?.name} — {b.customer_name || "Desconocido"} ({b.start_date} → {b.end_date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            <FormActions submitLabel="Completar Devolución" isPending={createInspection.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>

      {invoicePrompt && (
        <PostInspectionInvoiceDialog
          open={!!invoicePrompt}
          onOpenChange={(open) => { if (!open) setInvoicePrompt(null); }}
          booking={invoicePrompt.booking}
          forklift={invoicePrompt.forklift}
          damageCost={invoicePrompt.damageCost}
        />
      )}
    </div>
    </PageTransition>
  );
}