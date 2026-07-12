import { AddIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquipmentModel } from "@/features/fleet";
import { RentalLineRow } from "./RentalLineRow";

export interface RentalLine {
  modelId: string;
  quantity: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
  discount: number;
  discountType: "%" | "$";
}

interface RentalLineItemsProps {
  lines: RentalLine[];
  onChange: (lines: RentalLine[]) => void;
  models: EquipmentModel[];
  startDate?: Date;
  endDate?: Date;
}

export function RentalLineItems({ lines, onChange, models, startDate, endDate }: RentalLineItemsProps) {
  const updateLine = (index: number, field: keyof RentalLine, value: string | number) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const handleModelChange = (index: number, modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    onChange(
      lines.map((line, i) =>
        i === index
          ? {
              ...line,
              modelId,
              dailyRate: model?.default_daily_rate ?? 0,
              weeklyRate: model?.default_weekly_rate ?? 0,
              monthlyRate: model?.default_monthly_rate ?? 0,
            }
          : line,
      ),
    );
  };

  const addLine = () => {
    onChange([...lines, { modelId: "", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%" }]);
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
          <RentalLineRow
            key={index}
            line={line}
            index={index}
            models={models}
            disableRemove={lines.length <= 1}
            startDate={startDate}
            endDate={endDate}
            onUpdate={updateLine}
            onModelChange={handleModelChange}
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
