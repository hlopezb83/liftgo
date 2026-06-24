import { Button } from "@/components/ui/button";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rechazar REP"
      description="Indica el motivo del rechazo del complemento de pago."
    >
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
      <FormDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button variant="destructive" disabled={!notes.trim() || pending} onClick={onConfirm}>
          Rechazar
        </Button>
      </FormDialogFooter>
    </FormDialog>
  );
}
