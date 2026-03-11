import { useState } from "react";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { useBookings } from "@/hooks/useBookings";
import { useDeliveries, useCreateDelivery, useUpdateDelivery, useDeleteDelivery } from "@/hooks/useDeliveries";
import { useListPage } from "@/hooks/useListPage";
import { ListPageLayout } from "@/components/ListPageLayout";
import { MobileCardList } from "@/components/MobileCardList";
import { SortableTableHead } from "@/components/SortableTableHead";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableRow, TableCell, TableHead } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { PostDeliveryPickupDialog } from "@/components/PostDeliveryPickupDialog";
import { SignaturePad } from "@/components/SignaturePad";
import { useFormState } from "@/hooks/useFormState";
import { useActiveDrivers } from "@/hooks/useDrivers";
import { Card, CardContent } from "@/components/ui/card";
import { PlusCircle, TruckIcon, CheckCircle, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/RoleGuard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateDisplay } from "@/lib/utils";

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
  const { forkliftMap, forklifts } = useForkliftMap();
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

  const [signatureTarget, setSignatureTarget] = useState<string | null>(null);

  const { sortKey, sortDirection, toggleSort, page, setPage, totalPages, paginatedItems, isMobile } = useListPage(deliveries, {
    accessors: {
      scheduled_date: (d) => d.scheduled_date,
      type: (d) => d.type,
      forklift_name: (d) => forkliftMap.get(d.forklift_id)?.name || "",
      address: (d) => d.address || "",
      driver_name: (d) => d.driver_name || "",
      status: (d) => d.status,
    },
  });

  const mobileContent = isMobile ? (
    <MobileCardList
      items={paginatedItems}
      keyExtractor={(d) => d.id}
      emptyMessage="No hay entregas programadas"
      renderCard={(d) => (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{d.type === "delivery" ? "Entrega" : "Recolección"}</span>
              <StatusBadge status={d.status} />
            </div>
            <p className="text-sm font-medium">{forkliftMap.get(d.forklift_id)?.name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatDateDisplay(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</p>
            {d.address && <p className="text-xs text-muted-foreground truncate">{d.address}</p>}
            {d.driver_name && <p className="text-xs text-muted-foreground">Operador: {d.driver_name}</p>}
            {d.status !== "completed" && (
              <div className="mt-3 pt-3 border-t">
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSignatureTarget(d.id)}>
                  <CheckCircle className="h-4 w-4 mr-1 text-status-available" /> Completar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    />
  ) : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.scheduledDate) { toast.error("Montacargas y fecha son requeridos"); return; }
    createDelivery.mutate(
      {
        forklift_id: form.forkliftId, booking_id: form.bookingId || null, type: form.type,
        scheduled_date: format(form.scheduledDate, "yyyy-MM-dd"), scheduled_time: form.scheduledTime || null,
        address: form.address || null, driver_name: form.driverName || null, driver_phone: form.driverPhone || null, notes: form.notes || null,
      },
      { onSuccess: () => { toast.success("Transporte programado"); setDialogOpen(false); reset(); } }
    );
  };

  const markComplete = (id: string, signatureBase64?: string) => {
    const delivery = deliveries?.find((d) => d.id === id);
    updateDelivery.mutate(
      { id, status: "completed", completed_at: new Date().toISOString(), ...(signatureBase64 ? { signature_base64: signatureBase64 } : {}) } as any,
      {
        onSuccess: () => {
          toast.success("Marcado como completado");
          setSignatureTarget(null);
          if (delivery && delivery.type === "delivery" && delivery.booking_id) {
            const booking = bookings?.find((b) => b.id === delivery.booking_id);
            const forklift = forkliftMap.get(delivery.forklift_id);
            if (booking && forklift) {
              setPickupPrompt({
                delivery: { forklift_id: delivery.forklift_id, booking_id: delivery.booking_id, address: delivery.address, driver_name: delivery.driver_name, driver_phone: delivery.driver_phone },
                bookingEndDate: booking.end_date, forkliftName: forklift.name,
              });
            }
          }
        },
      }
    );
  };

  return (
    <>
      <ListPageLayout
        title="Entregas y Recolecciones"
        subtitle="Programa y rastrea el transporte de equipos"
        actions={
          <Button onClick={() => { reset(); setDialogOpen(true); }} size="sm">
            <PlusCircle className="h-4 w-4 mr-1" /> Programar
          </Button>
        }
        isLoading={isLoading}
        items={paginatedItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyMessage="No hay entregas programadas"
        tableHeader={
          <TableRow>
            <SortableTableHead sortKey="scheduled_date" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Fecha</SortableTableHead>
            <SortableTableHead sortKey="type" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Tipo</SortableTableHead>
            <SortableTableHead sortKey="forklift_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Montacargas</SortableTableHead>
            <SortableTableHead sortKey="address" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Dirección</SortableTableHead>
            <SortableTableHead sortKey="driver_name" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Operador</SortableTableHead>
            <SortableTableHead sortKey="status" currentSort={sortKey} currentDirection={sortDirection} onSort={toggleSort}>Estado</SortableTableHead>
            <TableHead className="w-12" />
          </TableRow>
        }
        renderRow={(d) => (
          <TableRow key={d.id} className="hover:bg-muted/50 border-l-2 border-transparent hover:border-primary transition-colors">
            <TableCell className="font-mono text-sm">{formatDateDisplay(d.scheduled_date)}{d.scheduled_time ? ` ${d.scheduled_time}` : ""}</TableCell>
            <TableCell className="capitalize">{d.type === "delivery" ? "Entrega" : "Recolección"}</TableCell>
            <TableCell className="font-medium">{forkliftMap.get(d.forklift_id)?.name || "—"}</TableCell>
            <TableCell className="max-w-[200px] truncate">{d.address || "—"}</TableCell>
            <TableCell>{d.driver_name || "—"}</TableCell>
            <TableCell><StatusBadge status={d.status} /></TableCell>
            <TableCell>
              {d.status !== "completed" && (
                <Button variant="ghost" size="icon" onClick={() => setSignatureTarget(d.id)} title="Marcar completado">
                  <CheckCircle className="h-4 w-4 text-status-available" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        )}
        customContent={mobileContent}
      />

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
                    <SelectItem key={b.id} value={b.id}>{b.customer_name || "Desconocido"} ({formatDateDisplay(b.start_date)} → {formatDateDisplay(b.end_date)})</SelectItem>
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

      <Dialog open={!!signatureTarget} onOpenChange={(open) => { if (!open) setSignatureTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-primary" /> Firma del Cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Solicite la firma del cliente para confirmar la entrega.</p>
          <SignaturePad
            onSave={(base64) => { if (signatureTarget) markComplete(signatureTarget, base64); }}
          />
          <Button variant="link" size="sm" className="text-muted-foreground" onClick={() => { if (signatureTarget) markComplete(signatureTarget); }}>
            Omitir Firma
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
