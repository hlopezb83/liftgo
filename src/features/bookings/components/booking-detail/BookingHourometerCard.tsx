import { InfoRow } from "@/components/forms/InfoRow";
import { Gauge } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  deliveryHours: number | null;
  pickupHours: number | null;
  hoursUsed: number | null;
}

export function BookingHourometerCard({ deliveryHours, pickupHours, hoursUsed }: Props) {
  if (deliveryHours == null && pickupHours == null) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" /> Horómetro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {deliveryHours != null && <InfoRow label="Al entregar" value={`${deliveryHours} hrs`} />}
        {pickupHours != null && <InfoRow label="Al recoger" value={`${pickupHours} hrs`} />}
        {hoursUsed != null && (
          <InfoRow label="Horas Usadas" value={`${hoursUsed} hrs`} emphasis />
        )}
      </CardContent>
    </Card>
  );
}
