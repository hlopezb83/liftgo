import { useId } from "react";
import { DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EquipmentModel } from "@/features/fleet";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { computeSaleLineTotal } from "./saleLineHelpers";
import type { SaleLine } from "./SaleLineItems";


interface Props {
  line: SaleLine;
  index: number;
  models: EquipmentModel[];
  disableRemove: boolean;
  currency?: string;
  onUpdate: (index: number, field: keyof SaleLine, value: string | number) => void;
  onRemove: (index: number) => void;
}

export function SaleLineRow({ line, index, models, disableRemove, currency = "MXN", onUpdate, onRemove }: Props) {
  const fieldId = useId();
  const model = models.find((item) => item.id === line.modelId);
  const modelName = model ? `${model.manufacturer} - ${model.model}` : undefined;
  return (
    <div role="group" aria-label={`Equipo de venta ${index + 1}`} className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_40px] items-start gap-3">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${fieldId}-model`} className="text-xs">Modelo *</Label>
        {/* R10-FE-01 (P0): mismo guard que RentalLineRow — ignorar "" del
            BubbleSelect de Radix al hidratar valores sin colección registrada. */}
        <Select value={line.modelId} onValueChange={(v) => { if (!v) return; onUpdate(index, "modelId", v); }}>
          <SelectTrigger id={`${fieldId}-model`} aria-describedby={modelName ? `${fieldId}-identity` : undefined}>
            <SelectValue placeholder="Seleccionar modelo" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.manufacturer} — {m.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modelName && <p id={`${fieldId}-identity`} className="break-words text-xs text-muted-foreground">{modelName}</p>}
      </div>
      <Button type="button" variant="ghost" size="icon" className="mt-6 h-10 w-10" aria-label="Eliminar línea" title="Eliminar línea" onClick={() => onRemove(index)} disabled={disableRemove}>
        <DeleteIcon className="h-4 w-4 text-destructive" />
      </Button>
      </div>
      <div className="grid grid-cols-2 items-end gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-quantity`} className="text-xs">Cantidad</Label>
        <Input
          id={`${fieldId}-quantity`}
          type="number"
          min="1"
          step="1"
          value={line.quantity}
          onChange={(e) => onUpdate(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-price`} className="text-xs">Precio Unit. ({currency})</Label>
        <Input
          id={`${fieldId}-price`}
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={line.unitPrice || ""}
          onChange={(e) => onUpdate(index, "unitPrice", parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="col-span-2 space-y-1.5">
        <Label htmlFor={`${fieldId}-discount`} className="text-xs">Descuento</Label>
        <div className="flex gap-1">
          <Input
            id={`${fieldId}-discount`}
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={line.discount || ""}
            onChange={(e) => onUpdate(index, "discount", parseFloat(e.target.value) || 0)}
            className="min-w-0 flex-1"
          />
          <ToggleGroup
            type="single"
            value={line.discountType || "%"}
            onValueChange={(v) => { if (v) onUpdate(index, "discountType", v); }}
            className="shrink-0"
          >
            <ToggleGroupItem value="%" aria-label="Descuento en porcentaje" className="h-10 w-10 text-xs px-0">%</ToggleGroupItem>
            <ToggleGroupItem value="$" aria-label={`Descuento en ${currency}`} className="h-10 w-10 text-xs px-0">$</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground">Importe neto <span className="text-xs">{currency}</span></span>
        <p className="font-semibold tabular-nums">{formatCurrencyWithCode(computeSaleLineTotal(line), currency)}</p>
      </div>
    </div>
  );
}
