import { useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateDelivery } from "@/features/deliveries/hooks/useDeliveries";
import { Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface PostBookingDeliveryDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void; bookingId: string; forkliftId: string;
  forkliftName: string; startDate: string; customerAddress: string | null; onSkip: () => void;
  currentIndex?: number; totalCount?: number;
}

export function PostBookingDeliveryDialog({ open, onOpenChange, bookingId, forkliftId, forkliftName, startDate, customerAddress, onSkip, currentIndex = 0, totalCount = 1 }: PostBookingDeliveryDialogProps) {
  
  const createDelivery = useCreateDelivery();
  const [showForm, setShowForm] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [address, setAddress] = useState(customerAddress || "");
  const [notes, setNotes] = useState("");
  const [hoursReading, setHoursReading] = useState("");

  const handleSchedule = () => {
    createDelivery.mutate(
      { forklift_id: forkliftId, booking_id: bookingId, scheduled_date: startDate, scheduled_time: scheduledTime || null, address: address || null, driver_name: driverName || null, driver_phone: driverPhone || null, notes: notes || null, type: "delivery", hours_reading: hoursReading ? parseFloat(hoursReading) : null },
      { onSuccess: () => { toast.success("Entrega programada"); onSkip(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            {totalCount > 1 ? `Entrega ${currentIndex + 1} de ${totalCount}` : "Reserva Creada"}
          </DialogTitle>
          <DialogDescription>¿Deseas programar la entrega de {forkliftName}?</DialogDescription>
        </DialogHeader>
        {!showForm ? (
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button className="w-full" onClick={() => setShowForm(true)}><Truck className="h-4 w-4 mr-2" /> Programar Entrega</Button>
            <Button variant="outline" className="w-full" onClick={onSkip}>Omitir por Ahora</Button>
          </DialogFooter>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-muted-foreground">Fecha</p><p className="font-medium">{startDate}</p></div>
              <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">Entrega</p></div>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Dirección de Entrega</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ingresa la dirección" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nombre del Operador</Label><Input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Opcional" /></div>
                <div className="space-y-1.5"><Label>Teléfono del Operador</Label><Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Opcional" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Hora Programada</Label><Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Horómetro (hrs)</Label><Input type="number" step="0.1" min="0" placeholder="Ej: 1250" value={hoursReading} onChange={(e) => setHoursReading(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Notas</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas de entrega opcionales" rows={2} /></div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={onSkip}>Omitir</Button>
              <Button onClick={handleSchedule} disabled={createDelivery.isPending}>{createDelivery.isPending ? "Programando..." : "Programar Entrega"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
