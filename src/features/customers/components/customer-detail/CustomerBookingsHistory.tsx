import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { CalendarDays } from "lucide-react";
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
              <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 text-sm">
                <div>
                  <p className="font-medium">{b.forklift?.name || "—"} — {b.forklift?.model || ""}</p>
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
