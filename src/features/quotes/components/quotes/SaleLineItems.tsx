import { AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquipmentModel } from "@/features/fleet";
import { SaleLineRow } from "./SaleLineRow";

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

export function SaleLineItems({ lines, onChange, models }: SaleLineItemsProps) {
  const updateLine = (index: number, field: keyof SaleLine, value: string | number) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
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
          <SaleLineRow
            key={index}
            line={line}
            index={index}
            models={models}
            disableRemove={lines.length <= 1}
            onUpdate={updateLine}
            onRemove={removeLine}
          />
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addLine} className="w-full">
          <AddIcon className="h-4 w-4 mr-1" /> Agregar modelo
        </Button>

        {models.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay modelos de equipo configurados.</p>
        )}
      </CardContent>
    </Card>
  );
}
