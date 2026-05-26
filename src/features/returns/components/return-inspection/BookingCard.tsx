import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";
import { InfoRow } from "@/components/InfoRow";
import { formatDateDisplay, formatDateRange } from "@/lib/utils";
import type { ReturnInspectionWithJoins } from "@/types/rental";

export function BookingCard({ ins }: { ins: ReturnInspectionWithJoins }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />Reserva
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow label="Cliente" value={ins.bookings?.customer_name || "—"} />
        {ins.bookings?.start_date && ins.bookings?.end_date && (
          <InfoRow
            label="Periodo"
            value={`${formatDateRange(ins.bookings.start_date, ins.bookings.end_date)}`}
          />
        )}
      </CardContent>
    </Card>
  );
}
