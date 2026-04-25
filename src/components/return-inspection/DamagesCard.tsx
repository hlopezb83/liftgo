import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { InfoRow } from "./InfoRow";
import { formatCurrency } from "@/lib/formatCurrency";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function DamagesCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  const hasDamage = ins.damage_notes || (ins.damage_cost && ins.damage_cost > 0);
  if (!hasDamage) return null;

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />Daños
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ins.damage_notes && (
          <div>
            <span className="text-sm text-muted-foreground">Notas de daños</span>
            <p className="text-sm mt-1 whitespace-pre-wrap">{ins.damage_notes}</p>
          </div>
        )}
        {ins.damage_cost != null && ins.damage_cost > 0 && (
          <InfoRow label="Costo por daños" value={formatCurrency(ins.damage_cost)} />
        )}
      </CardContent>
    </Card>
  );
}
