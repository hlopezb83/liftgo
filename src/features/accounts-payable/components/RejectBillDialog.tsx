import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRejectSupplierBill } from "../hooks/useBillApprovalMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
}

export function RejectBillDialog({ open, onOpenChange, billId, billNumber }: Props) {
  const reject = useRejectSupplierBill();
  const [notes, setNotes] = useState("");

  const canSubmit = notes.trim().length >= 3;

  const handleConfirm = () => {
    if (!canSubmit) return;
    reject.mutate(
      { billId, notes: notes.trim() },
      {
        onSuccess: () => {
          setNotes("");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rechazar factura {billNumber}</DialogTitle>
          <DialogDescription>
            La factura quedará marcada como rechazada y no podrá pagarse. Indica
            el motivo para que quede registrado en la bitácora.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>
            Motivo del rechazo <span className="text-destructive">*</span>
          </Label>
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe el motivo del rechazo"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canSubmit || reject.isPending}
          >
            {reject.isPending ? "Rechazando…" : "Rechazar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
