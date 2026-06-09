import { useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCancelSupplierBill } from "../hooks/useSupplierBillMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  billNumber: string;
  onCancelled?: () => void;
}

export function CancelSupplierBillDialog({
  open, onOpenChange, billId, billNumber, onCancelled,
}: Props) {
  const cancel = useCancelSupplierBill();
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    cancel.mutate(
      { id: billId, reason: reason || undefined },
      {
        onSuccess: () => {
          setReason("");
          onOpenChange(false);
          onCancelled?.();
        },
      },
    );
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar factura {billNumber}</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción marcará la factura como cancelada. Solo se permite cuando no tiene pagos aplicados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label>Motivo (opcional)</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={cancel.isPending}>
            {cancel.isPending ? "Cancelando…" : "Cancelar factura"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
