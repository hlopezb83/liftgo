import { DeleteIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EquipmentModel } from "@/features/fleet";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { computeRentalLineTotal } from "./rentalLineHelpers";
import type { RentalLine } from "./RentalLineItems";


interface Props {
  line: RentalLine;
  index: number;
  models: EquipmentModel[];
  disableRemove: boolean;
  startDate?: Date;
  endDate?: Date;
  onUpdate: (index: number, field: keyof RentalLine, value: string | number) => void;
  onModelChange: (index: number, modelId: string) => void;
  onRemove: (index: number) => void;
}

export function RentalLineRow({ line, index, models, disableRemove, startDate, endDate, onUpdate, onModelChange, onRemove }: Props) {
  return (
    <div className="space-y-3 border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_80px_40px] gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Modelo *</Label>
          <Select value={line.modelId} onValueChange={(v) => onModelChange(index, v)}>
            <SelectTrigger>
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
          <Label className="text-xs">Cantidad</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={line.quantity}
            onChange={(e) => onUpdate(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
        <div>
          <Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => onRemove(index)} disabled={disableRemove}>
            <DeleteIcon className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Tarifa Diaria</Label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={line.dailyRate || ""} onChange={(e) => onUpdate(index, "dailyRate", parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tarifa Semanal</Label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={line.weeklyRate || ""} onChange={(e) => onUpdate(index, "weeklyRate", parseFloat(e.target.value) || 0)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tarifa Mensual</Label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={line.monthlyRate || ""} onChange={(e) => onUpdate(index, "monthlyRate", parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Descuento</Label>
          <div className="flex gap-1">
            <Input type="number" min="0" step="0.01" placeholder="0" value={line.discount || ""} onChange={(e) => onUpdate(index, "discount", parseFloat(e.target.value) || 0)} className="w-24" />
            <ToggleGroup type="single" value={line.discountType || "%"} onValueChange={(v) => { if (v) onUpdate(index, "discountType", v); }} className="shrink-0">
              <ToggleGroupItem value="%" className="h-10 w-8 text-xs px-0">%</ToggleGroupItem>
              <ToggleGroupItem value="$" className="h-10 w-8 text-xs px-0">$</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="ml-auto text-right">
          <Label className="text-xs text-muted-foreground">Total estimado</Label>
          <p className="text-sm font-medium">{formatCurrency(computeRentalLineTotal(line, startDate, endDate))}</p>
        </div>
      </div>
    </div>
  );
}
