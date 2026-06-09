import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApproveSupplierBill } from "../hooks/useBillApprovalMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
}

export function ApproveBillDialog({ open, onOpenChange, billId, billNumber }: Props) {
  const approve = useApproveSupplierBill();
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    approve.mutate(
      { billId, notes: notes.trim() || undefined },
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
          <DialogTitle>Aprobar factura {billNumber}</DialogTitle>
          <DialogDescription>
            Al aprobar, la factura quedará habilitada para registrar pagos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Notas (opcional)</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={approve.isPending}>
            {approve.isPending ? "Aprobando…" : "Aprobar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
