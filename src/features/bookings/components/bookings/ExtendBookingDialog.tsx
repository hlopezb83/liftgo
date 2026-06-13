import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateBookingExtension } from "../../hooks/useBookingExtensions";

interface ExtendBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  currentEndDate: string;
}

export function ExtendBookingDialog({ open, onOpenChange, bookingId, currentEndDate }: ExtendBookingDialogProps) {
  const [newEndDate, setNewEndDate] = useState("");
  const [reason, setReason] = useState("");
  const createExtension = useCreateBookingExtension();

  const handleSubmit = () => {
    if (!newEndDate) return;
    createExtension.mutate(
      { booking_id: bookingId, original_end_date: currentEndDate, new_end_date: newEndDate, reason: reason || undefined },
      { onSuccess: () => { onOpenChange(false); setNewEndDate(""); setReason(""); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extender Renta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fecha de fin actual</Label>
            <Input value={currentEndDate} disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Nueva fecha de fin *</Label>
            <Input type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} min={currentEndDate} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea placeholder="Ej: Cliente solicitó extensión por 2 semanas más..." value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!newEndDate || createExtension.isPending}>
            {createExtension.isPending ? "Extendiendo..." : "Confirmar Extensión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
