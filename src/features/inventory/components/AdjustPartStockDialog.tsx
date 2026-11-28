import { useId, useRef, useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { FormDialogCancelButton } from "@/components/forms/FormDialogCancelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { usePrefillEffect } from "@/hooks/usePrefillEffect";
import { useAdjustPartStock, type PartInventory } from "../hooks/usePartsInventory";

export function AdjustPartStockDialog({ part, open, onOpenChange }: {
  part: PartInventory; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const adjust = useAdjustPartStock();
  const [expected, setExpected] = useState(part.stock_quantity);
  const [quantity, setQuantity] = useState(String(part.stock_quantity));
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const quantityId = useId();
  const reasonId = useId();
  const quantityRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const newQuantity = Number(quantity);
  const invalidQuantity = !quantity.trim() || !Number.isInteger(newQuantity) || newQuantity < 0;
  const invalidReason = !reason.trim();
  const showQuantityError = submitted && invalidQuantity;
  const showReasonError = submitted && invalidReason;

  usePrefillEffect(() => {
    if (!open) return;
    setExpected(part.stock_quantity);
    setQuantity(String(part.stock_quantity));
    setReason("");
    setSubmitted(false);
  }, [open, part.id]);

  const submit = () => {
    if (adjust.isPending) return;
    if (invalidQuantity || invalidReason) {
      setSubmitted(true);
      (invalidQuantity ? quantityRef.current : reasonRef.current)?.focus();
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
      <div className="space-y-1.5">
        <Label htmlFor={quantityId}>Conteo físico *</Label>
        <Input
          ref={quantityRef} id={quantityId} type="number" min={0} step={1}
          value={quantity} disabled={adjust.isPending} onChange={(e) => setQuantity(e.target.value)}
          aria-invalid={showQuantityError || undefined}
          aria-describedby={showQuantityError ? `${quantityId}-error` : undefined}
          className={showQuantityError ? "border-destructive focus-visible:ring-destructive" : undefined}
        />
        {showQuantityError && (
          <p id={`${quantityId}-error`} role="alert" className="text-sm text-destructive">
            Ingresa una cantidad entera de 0 o más.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={reasonId}>Motivo del ajuste *</Label>
        <Textarea
          ref={reasonRef} id={reasonId} value={reason} disabled={adjust.isPending}
          onChange={(e) => setReason(e.target.value)} placeholder="Ej. Conteo físico de almacén"
          aria-invalid={showReasonError || undefined}
          aria-describedby={showReasonError ? `${reasonId}-error` : undefined}
          className={showReasonError ? "border-destructive focus-visible:ring-destructive" : undefined}
        />
        {showReasonError && (
          <p id={`${reasonId}-error`} role="alert" className="text-sm text-destructive">
            Escribe el motivo del ajuste.
          </p>
        )}
      </div>
    </div>
    <FormDialogFooter><FormDialogCancelButton onCancel={() => onOpenChange(false)} disabled={adjust.isPending} />
      <Button onClick={submit} disabled={adjust.isPending}>Guardar ajuste</Button>
    </FormDialogFooter>
  </FormDialog>;
}
