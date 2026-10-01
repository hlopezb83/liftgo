import { useId, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { useAdjustPartStock, type PartInventory } from "../../hooks/usePartsInventory";

export function AdjustPartStockDialog({ part, open, onOpenChange }: {
  part: PartInventory; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const adjust = useAdjustPartStock();
  const [expected, setExpected] = useState(part.stock_quantity);
  const [quantity, setQuantity] = useState(String(part.stock_quantity));
  const [reason, setReason] = useState("");
  const quantityId = useId();
  const reasonId = useId();
  usePrefillEffect(() => {
    if (!open) return;
    setExpected(part.stock_quantity);
    setQuantity(String(part.stock_quantity));
    setReason("");
  }, [open, part.id]);

  const submit = () => {
    const newQuantity = Number(quantity);
    if (!quantity.trim() || !Number.isInteger(newQuantity) || newQuantity < 0 || !reason.trim()) {
      notifyValidation({ message: "Captura una cantidad entera no negativa y el motivo del ajuste" });
      return;
    }
    adjust.mutate({ id: part.id, expectedQuantity: expected, newQuantity, reason: reason.trim() }, {
      onSuccess: () => onOpenChange(false),
    });
  };
  return <FormDialog open={open} onOpenChange={onOpenChange} title="Ajustar existencias"
    description="Registra el conteo físico y su motivo. Si hay otro movimiento mientras editas, vuelve a revisar las existencias."
    isPending={adjust.isPending} isDirty={quantity !== String(expected) || !!reason.trim()}>
    <div className="space-y-4 py-2">
      <p className="text-sm">{part.sku} · {part.name}</p>
      <p className="text-sm text-muted-foreground">Existencias al abrir: {expected} unidades</p>
      <div className="space-y-1.5"><Label htmlFor={quantityId}>Conteo físico *</Label>
        <Input id={quantityId} type="number" min={0} step={1} value={quantity} disabled={adjust.isPending} onChange={(e) => setQuantity(e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label htmlFor={reasonId}>Motivo del ajuste *</Label>
        <Textarea id={reasonId} value={reason} disabled={adjust.isPending} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Conteo físico de almacén" />
      </div>
    </div>
    <FormDialogFooter><FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={adjust.isPending} />
      <Button onClick={submit} disabled={adjust.isPending}>Guardar ajuste</Button>
    </FormDialogFooter>
  </FormDialog>;
}
