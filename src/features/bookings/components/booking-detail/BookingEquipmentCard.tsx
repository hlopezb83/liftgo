import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { InfoRow } from "@/components/InfoRow";

export function BookingEquipmentCard({ name, model }: { name: string; model: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" /> Equipo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Nombre" value={name || "—"} />
        <InfoRow label="Modelo" value={model || "—"} />
      </CardContent>
    </Card>
  );
}
