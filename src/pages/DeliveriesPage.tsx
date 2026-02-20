import { useState } from "react";
import { PageTransition } from "@/components/PageTransition";
import { useForklifts, useBookings } from "@/hooks/useForkliftData";
import { useDeliveries, useCreateDelivery, useUpdateDelivery } from "@/hooks/useDeliveries";
import type { BookingWithForklift } from "@/hooks/useBookings";
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
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { PostDeliveryPickupDialog } from "@/components/PostDeliveryPickupDialog";
import { useFormState } from "@/hooks/useFormState";
import { useActiveDrivers } from "@/hooks/useDrivers";
import { PlusCircle, TruckIcon, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const initialForm = {
  forkliftId: "" as string,
  bookingId: "" as string,
  type: "delivery" as string,
  scheduledDate: new Date() as Date,
  scheduledTime: "" as string,
  address: "" as string,
  driverName: "" as string,
  driverPhone: "" as string,
  notes: "" as string,
};

export default function DeliveriesPage() {
  const { data: forklifts } = useForklifts();
  const { data: bookings } = useBookings();
  const { data: activeDrivers } = useActiveDrivers();
  const { data: deliveries, isLoading } = useDeliveries();
  const createDelivery = useCreateDelivery();
  const updateDelivery = useUpdateDelivery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);

  const [pickupPrompt, setPickupPrompt] = useState<{
    delivery: { forklift_id: string; booking_id: string | null; address: string | null; driver_name: string | null; driver_phone: string | null };
    bookingEndDate: string;
    forkliftName: string;
  } | null>(null);

  const forkliftMap = new Map(forklifts?.map((f) => [f.id, f]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.scheduledDate) { toast.error("Montacargas y fecha son requeridos"); return; }
    createDelivery.mutate(
      {
        forklift_id: form.forkliftId,
        booking_id: form.bookingId || null,
        type: form.type,
        scheduled_date: format(form.scheduledDate, "yyyy-MM-dd"),
        scheduled_time: form.scheduledTime || null,
        address: form.address || null,
        driver_name: form.driverName || null,
        driver_phone: form.driverPhone || null,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          toast.success("Transporte programado");
          setDialogOpen(false);
          reset();
        },
      }
    );
  };

  const markComplete = (id: string) => {
    const delivery = deliveries?.find((d) => d.id === id);
    updateDelivery.mutate(
      { id, status: "completed", completed_at: new Date().toISOString() },
      {
        onSuccess: () => {
          toast.success("Marcado como completado");
          if (delivery && delivery.type === "delivery" && delivery.booking_id) {
            const booking = bookings?.find((b) => b.id === delivery.booking_id);
            const fl = forkliftMap.get(delivery.forklift_id);
            if (booking && fl) {
              setPickupPrompt({
                delivery: {
                  forklift_id: delivery.forklift_id,
                  booking_id: delivery.booking_id,
                  address: delivery.address,
                  driver_name: delivery.driver_name,
                  driver_phone: delivery.driver_phone,
                },
                bookingEndDate: booking.end_date,
                forkliftName: fl.name,
              });
            }
          }
        },
      }
    );
  };

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Entregas y Recolecciones"
        subtitle="Programa y rastrea el transporte de equipos"
        action={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Programar
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Montacargas</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries && deliveries.length > 0 ? deliveries.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-sm">{d.scheduled_date}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</TableCell>
                    <TableCell className="capitalize">{d.type === "delivery" ? "Entrega" : "Recolección"}</TableCell>
                    <TableCell className="font-medium">{forkliftMap.get(d.forklift_id)?.name || "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{d.address || "—"}</TableCell>
                    <TableCell>{d.driver_name || "—"}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      {d.status !== "completed" && (
                        <Button variant="ghost" size="icon" onClick={() => markComplete(d.id)} title="Marcar completado">
                          <CheckCircle className="h-4 w-4 text-status-available" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )) : (
                  <EmptyRow colSpan={7} message="No hay entregas programadas" />
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TruckIcon className="h-4 w-4" /> Programar Transporte</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivery">Entrega</SelectItem>
                    <SelectItem value="pickup">Recolección</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Montacargas *</Label>
                <Select value={form.forkliftId} onValueChange={(v) => set("forkliftId", v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {forklifts?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Reserva Vinculada</Label>
              <Select value={form.bookingId} onValueChange={(v) => set("bookingId", v)}>
                <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  {bookings?.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.customer_name || "Desconocido"} ({b.start_date} → {b.end_date})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DatePickerField label="Fecha *" date={form.scheduledDate} onSelect={(d) => d && set("scheduledDate", d)} />
              <div className="space-y-1.5">
                <Label>Hora</Label>
                <Input type="time" value={form.scheduledTime} onChange={(e) => set("scheduledTime", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Dirección de Entrega</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Av. Reforma 123, CDMX" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Operador</Label>
                <Select
                  value={form.driverName}
                  onValueChange={(v) => {
                    set("driverName", v);
                    const driver = activeDrivers?.find((d) => d.name === v);
                    if (driver?.phone) set("driverPhone", driver.phone);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccionar operador" /></SelectTrigger>
                  <SelectContent>
                    {activeDrivers?.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono del Operador</Label>
                <Input value={form.driverPhone} onChange={(e) => set("driverPhone", e.target.value)} placeholder="+52 55 1234 5678" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Instrucciones especiales..." rows={2} />
            </div>

            <FormActions submitLabel="Programar" isPending={createDelivery.isPending} onCancel={() => setDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>

      {pickupPrompt && (
        <PostDeliveryPickupDialog
          open={!!pickupPrompt}
          onOpenChange={(open) => { if (!open) setPickupPrompt(null); }}
          delivery={pickupPrompt.delivery}
          bookingEndDate={pickupPrompt.bookingEndDate}
          forkliftName={pickupPrompt.forkliftName}
        />
      )}
    </div>
    </PageTransition>
  );
}