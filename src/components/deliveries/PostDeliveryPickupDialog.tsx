import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDelivery } from "@/hooks/useDeliveries";
import { Truck } from "lucide-react";
import { toast } from "sonner";

interface PostDeliveryPickupDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  delivery: { forklift_id: string; booking_id: string | null; address: string | null; driver_name: string | null; driver_phone: string | null };
  bookingEndDate: string; forkliftName: string;
}

export function PostDeliveryPickupDialog({ open, onOpenChange, delivery, bookingEndDate, forkliftName }: PostDeliveryPickupDialogProps) {
  const createDelivery = useCreateDelivery();
  const [showForm, setShowForm] = useState(false);
  const [address, setAddress] = useState(delivery.address || "");
  const [driverName, setDriverName] = useState(delivery.driver_name || "");
  const [driverPhone, setDriverPhone] = useState(delivery.driver_phone || "");
  const [scheduledTime, setScheduledTime] = useState("");
  const [notes, setNotes] = useState("");
  const [hoursReading, setHoursReading] = useState("");

  const handleSchedule = () => {
    createDelivery.mutate(
      { forklift_id: delivery.forklift_id, booking_id: delivery.booking_id, type: "pickup", scheduled_date: bookingEndDate, scheduled_time: scheduledTime || null, address: address || null, driver_name: driverName || null, driver_phone: driverPhone || null, notes: notes || null, hours_reading: hoursReading ? parseFloat(hoursReading) : null },
      { onSuccess: () => { toast.success("Recolección programada"); onOpenChange(false); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Truck className="h-5 w-5 text-primary" />¿Programar Recolección?</DialogTitle>
          <DialogDescription>La entrega de {forkliftName} se completó. ¿Deseas programar la recolección?</DialogDescription>
        </DialogHeader>
        {!showForm ? (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => setShowForm(true)}><Truck className="h-4 w-4 mr-2" /> Programar Recolección</Button>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>Omitir por Ahora</Button>
          </DialogFooter>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">Fecha de Recolección</p><p className="font-medium">{bookingEndDate}</p></div>
              <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">Recolección</p></div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Dirección de Recolección</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ingresa la dirección" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nombre del Operador</Label><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Teléfono del Operador</Label><Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Hora Programada</Label><Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Notas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Omitir</Button>
              <Button onClick={handleSchedule} disabled={createDelivery.isPending}>{createDelivery.isPending ? "Programando..." : "Programar Recolección"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
