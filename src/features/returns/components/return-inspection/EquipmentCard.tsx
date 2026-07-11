import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "@/components/icons";
import { InfoRow } from "@/components/forms/InfoRow";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function EquipmentCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" />Equipo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Nombre" value={ins.forklifts?.name || "—"} />
        <InfoRow label="Modelo" value={ins.forklifts?.model || "—"} />
      </CardContent>
    </Card>
  );
}
