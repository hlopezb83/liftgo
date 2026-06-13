import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  onConfirm: () => void;
  pending: boolean;
  inputId: string;
}

export function SupplierPaymentRejectDialog({
  open, onOpenChange, notes, onNotesChange, onConfirm, pending, inputId,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar REP</DialogTitle>
          <DialogDescription>Indica el motivo del rechazo del complemento de pago.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Motivo</Label>
          <Textarea
            id={inputId}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Ej. UUID no corresponde a la factura"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="destructive" disabled={!notes.trim() || pending} onClick={onConfirm}>
            Rechazar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
