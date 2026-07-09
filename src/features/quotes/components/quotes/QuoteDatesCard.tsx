import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
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
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {!isSale && (
          <p><span className="text-muted-foreground">Periodo:</span> {formatDateRange(startDate, endDate)}</p>
        )}
        <p><span className="text-muted-foreground">Válida Hasta:</span> {formatDateDisplay(validUntil)}</p>
      </CardContent>
    </Card>
  );
}

