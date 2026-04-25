import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { InfoRow } from "@/components/InfoRow";
import { format, parseISO, differenceInDays } from "date-fns";

export function BookingPeriodCard({ startDate, endDate }: { startDate: string; endDate: string }) {
  const duration = differenceInDays(parseISO(endDate), parseISO(startDate));
  const fmt = (d: string) => format(parseISO(d), "dd/MM/yyyy");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" /> Periodo de Renta
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Fecha de inicio" value={fmt(startDate)} />
        <InfoRow label="Fecha de fin" value={fmt(endDate)} />
        <InfoRow label="Duración" value={`${duration} día${duration !== 1 ? "s" : ""}`} />
      </CardContent>
    </Card>
  );
}
