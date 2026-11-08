import { StatusBadge } from "@/components/feedback/StatusBadge";
import { CalendarDays } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";
import { formatMtyDate } from "@/lib/utils";


interface ForkliftBookingsListProps {
  bookings: Tables<"bookings">[] | undefined;
  isPending?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

function BookingReadNotice({ bookings, isPending, isError, isFetching, onRetry }: ForkliftBookingsListProps) {
  return <>
    {isError && <div role="alert" className="mb-3 space-y-2 text-sm">
      <p>No se pudieron actualizar las reservas.</p>
      {bookings !== undefined && <p>Los datos guardados pueden estar desactualizados.</p>}
      {onRetry && <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={onRetry}>Reintentar reservas</Button>}
    </div>}
    {!isError && (isPending || isFetching || bookings === undefined) && <p role="status" className="mb-3 text-sm text-muted-foreground">
      {bookings === undefined ? "Cargando reservas…" : "Actualizando reservas; los datos guardados pueden estar desactualizados…"}
    </p>}
  </>;
}

export function ForkliftBookingsList({ bookings, isPending = false, isError = false, isFetching = false, onRetry }: ForkliftBookingsListProps) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Reservas</CardTitle></CardHeader>
      <CardContent>
        <BookingReadNotice bookings={bookings} isPending={isPending} isError={isError} isFetching={isFetching} onRetry={onRetry} />
        {bookings && bookings.length > 0 ? (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium">{b.customer_name || "Desconocido"}</span>
                  <span className="text-muted-foreground ml-2">
                    {formatMtyDate(b.start_date, "dd/MM")} – {formatMtyDate(b.end_date, "dd/MM/yyyy")}
                  </span>
                </div>
                <StatusBadge status={b.status} />
              </div>
            ))}
          </div>
        ) : !isError && !isPending && !isFetching && bookings !== undefined ? (
          <p className="text-sm text-muted-foreground">Sin reservas aún</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
