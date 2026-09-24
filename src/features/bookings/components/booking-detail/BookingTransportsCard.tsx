import { ListTruncationNotice } from "@/components/feedback/ListTruncationNotice";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { CalendarDays, ChevronRightIcon } from "@/components/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasModuleAccess } from "@/features/users";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateMty } from "@/lib/format/dateFormats";
import { Link } from "@/lib/router-compat-ui";
import { visibleListRows } from "@/lib/supabase/constants";

type Transport = Pick<Tables<"deliveries">,
  "id" | "delivery_number" | "type" | "status" | "scheduled_date" | "scheduled_time">;

interface BookingTransportsCardProps {
  deliveries: Transport[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

const typeLabels: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Recolección",
  return: "Devolución",
};

export function BookingTransportsCard({
  deliveries, isLoading, isError, isRetrying, onRetry,
}: BookingTransportsCardProps) {
  const canOpen = useHasModuleAccess("Entregas", "read");
  const rows = visibleListRows(deliveries);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" /> Transportes de la reserva
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div role="status" aria-label="Cargando transportes">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError ? (
          <QueryErrorState bare entity="los transportes de la reserva" onRetry={onRetry} isRetrying={isRetrying} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Esta reserva aún no tiene transportes registrados.</p>
        ) : (
          <>
            <ListTruncationNotice rows={deliveries} />
            <ul className="grid gap-3 sm:grid-cols-2">
              {rows.map((delivery) => {
                const content = (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-sm font-semibold">{delivery.delivery_number}</span>
                      <StatusBadge status={delivery.status} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium">{typeLabels[delivery.type] ?? "Transporte"}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDateMty(delivery.scheduled_date)}
                          {delivery.scheduled_time ? ` · ${delivery.scheduled_time.slice(0, 5)}` : " · Sin hora asignada"}
                        </p>
                      </div>
                      {canOpen && <ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    </div>
                  </>
                );
                return (
                  <li key={delivery.id} className="min-w-0">
                    {canOpen ? (
                      <Link
                        to={`/deliveries/${delivery.id}`}
                        aria-label={`Abrir ${delivery.delivery_number}`}
                        className="block h-full space-y-3 rounded-lg border p-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="h-full space-y-3 rounded-lg border p-4">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
