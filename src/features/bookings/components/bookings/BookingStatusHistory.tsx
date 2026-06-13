import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { History } from "lucide-react";
import { format } from "date-fns";
import { useBookingStatusHistory } from "@/features/bookings/hooks/bookingDetail/useBookingStatusHistory";

interface BookingStatusHistoryProps {
  bookingId: string;
}

function getStatus(data: unknown): string | null {
  if (data && typeof data === "object" && "status" in data) {
    return (data as Record<string, unknown>).status as string;
  }
  return null;
}

export function BookingStatusHistory({ bookingId }: BookingStatusHistoryProps) {
  const { data: logs = [], isLoading } = useBookingStatusHistory(bookingId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          Historial de Estatus
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : logs.length > 0 ? (
          <div className="space-y-3">
            {logs.map((log) => {
              const fromStatus = getStatus(log.old_data);
              const toStatus = getStatus(log.new_data);
              return (
                <div key={log.id} className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 flex items-center gap-2 flex-wrap">
                    {fromStatus ? <StatusBadge status={fromStatus} /> : <span className="text-muted-foreground">—</span>}
                    <span className="text-muted-foreground">→</span>
                    {toStatus ? <StatusBadge status={toStatus} /> : <span className="text-muted-foreground">—</span>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin cambios de estatus registrados</p>
        )}
      </CardContent>
    </Card>
  );
}
