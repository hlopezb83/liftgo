import { StatusBadge } from "@/components/feedback/StatusBadge";
import { CalendarDays } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateRange } from "@/lib/utils";

interface BookingRow {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  forklift?: { name?: string | null; model?: string | null } | null;
}

export function CustomerBookingsHistory({ bookings }: { bookings: BookingRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Historial de Reservas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {bookings.length > 0 ? (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex flex-col items-start gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium [overflow-wrap:anywhere]">{b.forklift?.name || "-"} - {b.forklift?.model || ""}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateRange(b.start_date, b.end_date)}
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">Sin reservas aún</p>
        )}
      </CardContent>
    </Card>
  );
}
