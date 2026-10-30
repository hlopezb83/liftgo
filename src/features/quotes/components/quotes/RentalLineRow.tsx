import { useId } from "react";
import { DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EquipmentModel } from "@/features/fleet";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { cn } from "@/lib/utils";
import { computeRentalLineTotal } from "./rentalLineHelpers";
import type { RentalLine } from "./RentalLineItems";


interface Props {
  line: RentalLine;
  index: number;
  models: EquipmentModel[];
  disableRemove: boolean;
  startDate?: Date;
  endDate?: Date;
  currency?: string;
  onUpdate: (index: number, field: keyof RentalLine, value: string | number) => void;
  onModelChange: (index: number, modelId: string) => void;
  onRemove: (index: number) => void;
}

export function RentalLineRow({ line, index, models, disableRemove, startDate, endDate, currency = "MXN", onUpdate, onModelChange, onRemove }: Props) {
  const fieldId = useId();
  const model = models.find((item) => item.id === line.modelId);
  const modelName = model ? `${model.manufacturer} - ${model.model}` : line.legacyDescription;
  const estimatedTotal = computeRentalLineTotal(line, startDate, endDate);
  return (

    <div role="group" aria-label={`Equipo de renta ${index + 1}`} className="space-y-3 rounded-lg border border-border p-3 sm:p-4">
      <div className={cn(
        "grid gap-3 items-end",
        disableRemove
          ? "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_80px]"
          : "grid-cols-[minmax(0,1fr)_40px] sm:grid-cols-[minmax(0,1fr)_80px_40px]",
      )}>
        <div className={cn("min-w-0 space-y-1.5", !disableRemove && "col-span-2 sm:col-span-1")}>
          <Label htmlFor={`${fieldId}-model`} className="text-xs">Modelo *</Label>
          {/* R10-FE-01 (P0): el BubbleSelect de Radix emite onValueChange("")
              cuando el valor se hidrata sin colección registrada (dropdown
              nunca abierto). Un "" jamás es intención del usuario. */}
          <Select value={line.modelId} onValueChange={(v) => { if (!v) return; onModelChange(index, v); }}>
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
        </div>
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
        {!disableRemove && <div>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10" aria-label="Eliminar línea" title="Eliminar línea" onClick={() => onRemove(index)}>
            <DeleteIcon className="h-4 w-4 text-destructive" />
          </Button>
        </div>}
      </div>
      {modelName && <p id={`${fieldId}-identity`} className="break-words text-xs text-muted-foreground">{modelName}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-daily`} className="text-xs">Tarifa Diaria ({currency})</Label>
          <Input id={`${fieldId}-daily`} type="number" min="0" step="0.01" placeholder="0.00" value={line.dailyRate || ""} onChange={(e) => onUpdate(index, "dailyRate", parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-weekly`} className="text-xs">Tarifa Semanal ({currency})</Label>
          <Input id={`${fieldId}-weekly`} type="number" min="0" step="0.01" placeholder="0.00" value={line.weeklyRate || ""} onChange={(e) => onUpdate(index, "weeklyRate", parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-monthly`} className="text-xs">Tarifa Mensual ({currency})</Label>
          <Input id={`${fieldId}-monthly`} type="number" min="0" step="0.01" placeholder="0.00" value={line.monthlyRate || ""} onChange={(e) => onUpdate(index, "monthlyRate", parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t pt-3">
        <div className="w-full space-y-1.5 sm:w-auto">
          <Label htmlFor={`${fieldId}-discount`} className="text-xs">Descuento</Label>
          <div className="flex gap-1">
            <Input id={`${fieldId}-discount`} type="number" min="0" step="0.01" placeholder="0" value={line.discount || ""} onChange={(e) => onUpdate(index, "discount", parseFloat(e.target.value) || 0)} className="min-w-0 flex-1 sm:w-24 sm:flex-none" />
            <ToggleGroup type="single" value={line.discountType || "%"} onValueChange={(v) => { if (v) onUpdate(index, "discountType", v); }} className="shrink-0">
              <ToggleGroupItem value="%" aria-label="Descuento en porcentaje" className="h-10 w-10 text-xs px-0">%</ToggleGroupItem>
              <ToggleGroupItem value="$" aria-label={`Descuento en ${currency}`} className="h-10 w-10 text-xs px-0">$</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        {/* R14-FE-07: sin modelo ni fechas el "$0.00" se leía como precio real. */}
        <div className="ml-auto text-right">
          <span className="text-xs text-muted-foreground">Total estimado {currency}</span>
          <p className="text-sm font-semibold tabular-nums">
            {estimatedTotal > 0 ? formatCurrencyWithCode(estimatedTotal, currency) : <span className="text-muted-foreground">-</span>}
          </p>
        </div>

      </div>
    </div>
  );
}
