import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { useFormState } from "@/hooks/useFormState";
import { useCreateDelivery } from "@/hooks/useDeliveries";
import { useActiveDrivers } from "@/hooks/useDrivers";
import { useForkliftMap } from "@/hooks/useForkliftMap";
import { useBookings } from "@/hooks/useBookings";
import { TruckIcon, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";

const initialForm = {
  forkliftId: "",
  bookingId: "",
  type: "delivery",
  scheduledDate: new Date(),
  scheduledTime: "",
  address: "",
  driverName: "",
  driverPhone: "",
  notes: "",
};

export function DeliveryFormDialog() {
  const [open, setOpen] = useState(false);
  const { form, set, reset } = useFormState(initialForm);
  const { forklifts } = useForkliftMap();
  const { data: bookings } = useBookings();
  const { data: activeDrivers } = useActiveDrivers();
  const createDelivery = useCreateDelivery();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.forkliftId || !form.scheduledDate) {
      toast.error("Montacargas y fecha son requeridos");
      return;
    }
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
      { onSuccess: () => { toast.success("Transporte programado"); setOpen(false); reset(); } }
    );
  };

  return (
    <>
      <Button onClick={() => { reset(); setOpen(true); }} size="sm">
        <PlusCircle className="h-4 w-4 mr-1" /> Programar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
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
                    <SelectItem key={b.id} value={b.id}>{b.customer_name || "Desconocido"} ({formatDateRange(b.start_date, b.end_date)})</SelectItem>
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

            <FormActions submitLabel="Programar" isPending={createDelivery.isPending} onCancel={() => setOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
