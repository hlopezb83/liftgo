// arch:excepción §19 (tabla densa editable)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Plus, Trash2 } from "lucide-react";
import type { EquipmentModel } from "@/features/fleet/hooks/useEquipmentModels";
import { formatCurrency } from "@/lib/formatCurrency";

export interface SaleLine {
  modelId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  discountType: "%" | "$";
}

interface SaleLineItemsProps {
  lines: SaleLine[];
  onChange: (lines: SaleLine[]) => void;
  models: EquipmentModel[];
}

function computeLineTotal(line: SaleLine): number {
  const base = line.quantity * line.unitPrice;
  if (!line.discount || line.discount <= 0) return base;
  if (line.discountType === "$") return Math.max(0, base - line.discount);
  return Math.max(0, base * (1 - line.discount / 100));
}

export function SaleLineItems({ lines, onChange, models }: SaleLineItemsProps) {
  const updateLine = (index: number, field: keyof SaleLine, value: string | number) => {
    const updated = lines.map((line, i) =>
      i === index ? { ...line, [field]: value } : line
    );
    onChange(updated);
  };

  const addLine = () => {
    onChange([...lines, { modelId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "%" }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    onChange(lines.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Equipos a Cotizar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_120px_140px_100px_40px] gap-3 items-end border-b border-border pb-4 last:border-0 last:pb-0">
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo *</Label>
              <Select value={line.modelId} onValueChange={(v) => updateLine(index, "modelId", v)}>
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
                onChange={(e) => updateLine(index, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
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
                onChange={(e) => updateLine(index, "unitPrice", parseFloat(e.target.value) || 0)}
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
                  onChange={(e) => updateLine(index, "discount", parseFloat(e.target.value) || 0)}
                  className="flex-1"
                />
                <ToggleGroup
                  type="single"
                  value={line.discountType || "%"}
                  onValueChange={(v) => { if (v) updateLine(index, "discountType", v); }}
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
                {formatCurrency(computeLineTotal(line))}
              </div>
            </div>

            <div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => removeLine(index)}
                disabled={lines.length <= 1}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addLine} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> Agregar modelo
        </Button>

        {models.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay modelos de equipo configurados.</p>
        )}
      </CardContent>
    </Card>
  );
}
