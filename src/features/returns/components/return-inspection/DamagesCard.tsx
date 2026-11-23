import { InfoRow } from "@/components/forms/InfoRow";
import { WarnIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { ReturnInspectionWithJoins } from "@/types/rental";
import { DAMAGE_CONDITIONS } from "../../lib/returnInspectionSchema";

export function DamagesCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  const damageCost = ins.damage_cost;
  const showCost = damageCost !== null && (damageCost > 0 || (damageCost === 0 && DAMAGE_CONDITIONS.includes(ins.condition)));
  if (!ins.damage_notes && !showCost) return null;

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <WarnIcon className="h-4 w-4 text-destructive" />Daños
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ins.damage_notes && (
          <div>
            <span className="text-sm text-muted-foreground">Notas de daños</span>
            <p className="text-sm mt-1 whitespace-pre-wrap">{ins.damage_notes}</p>
          </div>
        )}
        {showCost && (
          <InfoRow label="Costo por daños" value={damageCost === 0 ? "Sin cargo registrado" : formatCurrency(damageCost)} />
        )}
      </CardContent>
    </Card>
  );
}
