import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { RequiredMark } from "@/components/forms/RequiredMark";
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechazar factura ${billNumber}`}
      description="La factura quedará marcada como rechazada y no podrá pagarse. Indica el motivo para que quede registrado en la bitácora."
    >
      <div className="space-y-1.5">
        <Label>Motivo del rechazo <RequiredMark /></Label>
        <Textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Describe el motivo del rechazo"
        />
      </div>
      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={!canSubmit || reject.isPending}
        >
          {reject.isPending ? "Rechazando…" : "Rechazar"}
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
