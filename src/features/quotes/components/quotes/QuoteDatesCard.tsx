import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";

interface Props {
  isSale: boolean;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  validUntil: string | null | undefined;
}

export function QuoteDatesCard({ isSale, startDate, endDate, validUntil }: Props) {
  const title = isSale ? "Vigencia" : "Fechas";
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {!isSale && (
          <p><span className="text-muted-foreground">Periodo:</span> {formatDateRange(startDate, endDate)}</p>
        )}
        <p><span className="text-muted-foreground">Válida Hasta:</span> {formatDateDisplay(validUntil)}</p>
      </CardContent>
    </Card>
  );
}
