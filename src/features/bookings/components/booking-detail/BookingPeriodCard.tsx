import { differenceInDays, parseISO } from "date-fns";
import { CalendarDays } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMtyDate } from "@/lib/utils";

export function BookingPeriodCard({ startDate, endDate }: { startDate: string; endDate: string }) {
  // R17-L: los rangos de renta son inclusivos (start/end cuentan como un día
  // cada uno). Antes marcábamos 0 días para una renta 01-01→01-01.
  const duration = Math.max(1, differenceInDays(parseISO(endDate), parseISO(startDate)) + 1);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" /> Periodo de Renta
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="flex items-center justify-between gap-3 sm:block">
          <span className="text-sm text-muted-foreground sm:block">Inicio</span>
          <span className="text-sm font-medium">{formatMtyDate(startDate)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:block">
          <span className="text-sm text-muted-foreground sm:block">Fin</span>
          <span className="text-sm font-medium">{formatMtyDate(endDate)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:block">
          <span className="text-sm text-muted-foreground sm:block">Duración</span>
          <span className="text-sm font-medium">{duration} día{duration !== 1 ? "s" : ""}</span>
        </div>
      </CardContent>
    </Card>
  );
}
