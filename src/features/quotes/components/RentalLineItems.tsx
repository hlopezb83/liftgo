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
  /** R13-FE-01: importe histórico de partidas legacy sin modelo. */
  legacyTotal?: number;
  legacyDescription?: string;
  /** UI-only provenance; quote payload/schema persist only actual prices. */
  rateSources?: Partial<Record<"dailyRate" | "weeklyRate" | "monthlyRate", "auto" | "manual">>;
}

interface RentalLineItemsProps {
  lines: RentalLine[];
  onChange: (lines: RentalLine[]) => void;
  models: EquipmentModel[];
  modelsLoading?: boolean;
  startDate?: Date;
  endDate?: Date;
  currency?: string;
}

export function RentalLineItems({ lines, onChange, models, modelsLoading, startDate, endDate, currency }: RentalLineItemsProps) {
  // Track only values filled during this editing session. Existing/historical
  // prices are never inferred to be automatic just because they match a catalog.
  const updateLine = (index: number, field: keyof RentalLine, value: string | number) => {
    onChange(lines.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, [field]: value };
      const sources = { ...line.rateSources };
      if (field === "dailyRate" || field === "weeklyRate" || field === "monthlyRate") sources[field] = "manual";
      next.rateSources = sources;
      return next;
    }));
  };

  const handleModelChange = (index: number, modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    onChange(lines.map((line, i) => {
      if (i !== index) return line;
      const next = { ...line, modelId };
      const sources = { ...line.rateSources };
      const defaults = {
        dailyRate: model?.default_daily_rate ?? 0,
        weeklyRate: model?.default_weekly_rate ?? 0,
        monthlyRate: model?.default_monthly_rate ?? 0,
      };
      for (const field of ["dailyRate", "weeklyRate", "monthlyRate"] as const) {
        if (sources[field] === "auto" || (!line.modelId && !line[field] && sources[field] !== "manual")) {
          next[field] = defaults[field];
          sources[field] = "auto";
        }
      }
      next.rateSources = sources;
      return next;
    }));
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
            currency={currency}
            onUpdate={updateLine}
            onModelChange={handleModelChange}
            onRemove={removeLine}
          />
        ))}

        <Button type="button" variant="outline" size="sm" onClick={addLine} className="w-full">
          <AddIcon className="h-4 w-4 mr-1" /> Agregar modelo
        </Button>

        {/* R7-FE-07e (N7-UX-09): no mostrar mientras los modelos aún cargan. */}
        {!modelsLoading && models.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay modelos de equipo configurados.</p>
        )}
      </CardContent>
    </Card>
  );
}
