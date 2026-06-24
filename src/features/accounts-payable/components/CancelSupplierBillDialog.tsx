import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Cancelar factura ${billNumber}`}
      descriptionNode={
        <div className="space-y-3">
          <p>Esta acción marcará la factura como cancelada. Solo se permite cuando no tiene pagos aplicados.</p>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
      }
      confirmLabel="Cancelar factura"
      cancelLabel="Volver"
      destructive
      loading={cancel.isPending}
      onConfirm={handleConfirm}
    />
  );
}

