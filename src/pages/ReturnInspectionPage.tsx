import { useState } from "react";
import { useBookings } from "@/hooks/useBookings";
import { useForklifts } from "@/hooks/useForklifts";
import { useCreateReturnInspection, useReturnInspections } from "@/hooks/useReturnInspections";
import { usePagination } from "@/hooks/usePagination";
import { ListPageLayout } from "@/components/ListPageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { FormActions } from "@/components/FormActions";
import { PostInspectionInvoiceDialog } from "@/components/PostInspectionInvoiceDialog";
import { useFormState } from "@/hooks/useFormState";
import { formatCurrency } from "@/lib/formatCurrency";
import { INSPECTION_CONDITIONS, FUEL_LEVELS, STATUS_LABELS, FUEL_LEVEL_LABELS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
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

  const activeBookings = bookings?.filter((b) => b.status === "confirmed" && !b.return_status);
  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const { page, setPage, totalPages, paginatedItems } = usePagination(inspections);
  const isMobile = useIsMobile();

  const mobileContent = isMobile ? (
    <div className="space-y-3">
      {paginatedItems.length > 0 ? paginatedItems.map((ins) => {
        const insWithJoins = ins as typeof ins & { forklifts?: { name: string }; bookings?: { customer_name: string | null } };
        return (
          <Card key={ins.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{insWithJoins.forklifts?.name || "—"}</span>
                <StatusBadge status={ins.condition} />
              </div>
              <p className="text-sm text-muted-foreground">{insWithJoins.bookings?.customer_name || "—"}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span className="font-mono">{format(new Date(ins.inspected_at), "d MMM yyyy", { locale: es })}</span>
                {ins.damage_cost ? <span className="font-mono font-medium text-foreground">{formatCurrency(ins.damage_cost)}</span> : null}
              </div>
            </CardContent>
          </Card>
        );
      }) : (
        <Card><CardContent className="py-14 text-center text-sm text-muted-foreground">No hay inspecciones de devolución</CardContent></Card>
      )}
    </div>
  ) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bookingId) { toast.error("Selecciona una reserva para devolver"); return; }
    const booking = bookings?.find((b) => b.id === form.bookingId);
    if (!booking) return;
    const damageCost = form.damageCost ? parseFloat(form.damageCost) : 0;
    createInspection.mutate(
      {
        booking_id: form.bookingId, forklift_id: booking.forklift_id, condition: form.condition,
        damage_notes: form.damageNotes || null, damage_cost: damageCost,
        hours_used: form.hoursUsed ? parseFloat(form.hoursUsed) : null, fuel_level: form.fuelLevel || null, inspected_by: form.inspectedBy || null,
      },
      {
        onSuccess: () => {
          toast.success("Inspección de devolución registrada — montacargas marcado como disponible");
          setDialogOpen(false);
          const fl = forkliftMap.get(booking.forklift_id);
          if (fl) {
            setInvoicePrompt({
              booking: { id: booking.id, customer_name: booking.customer_name, customer_id: booking.customer_id, start_date: booking.start_date, end_date: booking.end_date, forklift_id: booking.forklift_id },
              forklift: fl, damageCost,
            });
          }
          reset();
        },
      }
    );
  };

  return (
    <>
      <ListPageLayout
        title="Devoluciones y Revisión"
        subtitle="Inspecciona equipos devueltos y actualiza el estado de la flota"
        actions={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Nueva Devolución
          </Button>
        }
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No hay inspecciones de devolución"
        tableHeader={
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Montacargas</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Condición</TableHead>
            <TableHead>Costo por Daños</TableHead>
            <TableHead>Inspector</TableHead>
          </TableRow>
        }
        renderRow={(ins) => {
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
        }}
        customContent={mobileContent}
      />

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
    </>
  );
}
