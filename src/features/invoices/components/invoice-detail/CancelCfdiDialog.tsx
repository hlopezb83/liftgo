import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANCELLATION_REASONS } from "@/lib/domain/satCatalogs";
import { useCancelCfdi } from "../../hooks/invoices/cfdi/useCancelCfdi";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);


interface CancelCfdiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceTotal: number;
  onSuccess: () => void;
}

export function CancelCfdiDialog({ open, onOpenChange, invoiceId, invoiceTotal, onSuccess }: CancelCfdiDialogProps) {
  const [motive, setMotive] = useState("02");
  const [substitutionUuid, setSubstitutionUuid] = useState("");
  const cancelCfdi = useCancelCfdi();

  const needsSubstitution = motive === "01";
  const validSubstitution = !needsSubstitution || isUUID(substitutionUuid.trim());

  const handleCancel = () => {
    cancelCfdi.mutate(
      {
        invoiceId,
        motive,
        substitutionUuid: needsSubstitution ? substitutionUuid.trim() : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSubstitutionUuid("");
          setMotive("02");
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
          <div>
            <Label>Motivo</Label>
            <Select value={motive} onValueChange={setMotive}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((r) => (
                  <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSubstitution && (
            <div>
              <Label>UUID de factura sustituta</Label>
              <Input
                value={substitutionUuid}
                onChange={(e) => setSubstitutionUuid(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Captura el UUID (folio fiscal) del CFDI que sustituye a este.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelCfdi.isPending || !validSubstitution}
          >
            {cancelCfdi.isPending ? "Cancelando..." : "Confirmar Cancelación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
