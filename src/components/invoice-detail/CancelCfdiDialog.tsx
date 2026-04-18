import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANCELLATION_REASONS } from "@/lib/satCatalogs";
import { useCancelCfdi } from "@/hooks/useCancelCfdi";

interface CancelCfdiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceTotal: number;
  onSuccess: () => void;
}

export function CancelCfdiDialog({ open, onOpenChange, invoiceId, invoiceTotal, onSuccess }: CancelCfdiDialogProps) {
  const [cancelReason, setCancelReason] = useState("02");
  const cancelCfdi = useCancelCfdi();

  const handleCancel = () => {
    cancelCfdi.mutate(
      { invoiceId, cancellationReason: cancelReason },
      {
        onSuccess: () => {
          onOpenChange(false);
          onSuccess();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar CFDI</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Selecciona el motivo de cancelación según el SAT.
          </p>
          {invoiceTotal > 1000 && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              ⚠️ Facturas mayores a $1,000 MXN requieren aprobación del receptor ante el SAT.
            </div>
          )}
          <Select value={cancelReason} onValueChange={setCancelReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CANCELLATION_REASONS.map((r) => (
                <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button variant="destructive" onClick={handleCancel} disabled={cancelCfdi.isPending}>
            {cancelCfdi.isPending ? "Cancelando..." : "Confirmar Cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
