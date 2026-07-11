import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Trash2 } from "@/components/icons";
import type { EquipmentModel } from "@/features/fleet";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { SaleLine } from "./SaleLineItems";
import { computeSaleLineTotal } from "./saleLineHelpers";


interface Props {
  line: SaleLine;
  index: number;
  models: EquipmentModel[];
  disableRemove: boolean;
  onUpdate: (index: number, field: keyof SaleLine, value: string | number) => void;
  onRemove: (index: number) => void;
}

export function SaleLineRow({ line, index, models, disableRemove, onUpdate, onRemove }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_80px_120px_140px_100px_40px] gap-3 items-end border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="space-y-1.5">
        <Label className="text-xs">Modelo *</Label>
        <Select value={line.modelId} onValueChange={(v) => onUpdate(index, "modelId", v)}>
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

      <div className="space-y-1.5">
        <Label className="text-xs">Precio Unit.</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={line.unitPrice || ""}
          onChange={(e) => onUpdate(index, "unitPrice", parseFloat(e.target.value) || 0)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Descuento</Label>
        <div className="flex gap-1">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={line.discount || ""}
            onChange={(e) => onUpdate(index, "discount", parseFloat(e.target.value) || 0)}
            className="flex-1"
          />
          <ToggleGroup
            type="single"
            value={line.discountType || "%"}
            onValueChange={(v) => { if (v) onUpdate(index, "discountType", v); }}
            className="shrink-0"
          >
            <ToggleGroupItem value="%" className="h-10 w-8 text-xs px-0">%</ToggleGroupItem>
            <ToggleGroupItem value="$" className="h-10 w-8 text-xs px-0">$</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Total</Label>
        <div className="h-10 flex items-center text-sm font-medium">
          {formatCurrency(computeSaleLineTotal(line))}
        </div>
      </div>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={() => onRemove(index)}
          disabled={disableRemove}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
