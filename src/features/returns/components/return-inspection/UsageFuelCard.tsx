import { InfoRow } from "@/components/forms/InfoRow";
import { Fuel } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FUEL_LEVEL_LABELS } from "@/lib/constants";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function UsageFuelCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Fuel className="h-4 w-4 text-muted-foreground" />Uso y Combustible
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Horas de uso" value={ins.hours_used != null ? `${ins.hours_used} hrs` : "—"} />
        <InfoRow
          label="Nivel de combustible"
          value={ins.fuel_level ? (FUEL_LEVEL_LABELS[ins.fuel_level] || ins.fuel_level) : "—"}
        />
      </CardContent>
    </Card>
  );
}
