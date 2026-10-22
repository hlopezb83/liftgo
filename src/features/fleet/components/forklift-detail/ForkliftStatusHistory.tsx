import { StatusBadge } from "@/components/feedback/StatusBadge";
import { HistoryIcon, ChevronRightIcon, ClockIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";
import { formatDateTimeMty } from "@/lib/format/dateFormats";

interface ForkliftStatusHistoryProps {
  logs: Tables<"status_logs">[];
  isLoading?: boolean;
  isError?: boolean;
  isFetching?: boolean;
  onRetry?: () => void;
}

export function ForkliftStatusHistory({
  logs,
  isLoading = false,
  isError = false,
  isFetching = false,
  onRetry,
}: ForkliftStatusHistoryProps) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground"
            />{" "}
            Historial de Estado
          </CardTitle>
          {!isLoading && !isError && logs.length > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {logs.length} {logs.length === 1 ? "registro" : "registros"}
            </span>
          )}
        </div>
        <CardDescription>
          Cambios registrados, del más reciente al más antiguo. Hora de
          Monterrey.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm"
          >
            <p className="font-medium">
              No se pudo cargar el historial de estado
            </p>
            <p className="mt-1 text-muted-foreground">
              Inténtalo de nuevo para consultar los cambios registrados.
            </p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 min-h-11"
                disabled={isFetching}
                onClick={onRetry}
              >
                {isFetching ? "Reintentando…" : "Reintentar"}
              </Button>
            )}
          </div>
        ) : isLoading ? (
          <div
            role="status"
            aria-label="Cargando historial de estado"
            className="space-y-4"
          >
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-20 rounded-lg" />
            ))}
            <span className="sr-only">Cargando historial de estado</span>
          </div>
        ) : logs.length > 0 ? (
          <ol aria-label="Cambios de estado" className="space-y-0">
            {logs.map((log, index) => (
              <li key={log.id} className="relative pb-5 pl-7 last:pb-0">
                {index < logs.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-[5px] top-3 w-px bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-2 h-3 w-3 rounded-full border-2 ${index === 0 ? "border-primary bg-primary/15" : "border-muted-foreground/40 bg-background"}`}
                />
                <div className="min-w-0 rounded-lg border bg-muted/20 p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm [&>div]:max-w-full [&>div]:whitespace-normal [&>div]:[overflow-wrap:anywhere]">
                      {log.from_status ? (
                        <>
                          <span className="sr-only">De </span>
                          <StatusBadge status={log.from_status} />
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Sin estado anterior
                        </span>
                      )}
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                      <span className="sr-only">a </span>
                      <StatusBadge status={log.to_status} />
                    </div>
                    <time
                      dateTime={log.changed_at}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground"
                    >
                      <ClockIcon
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      {formatDateTimeMty(log.changed_at)}
                    </time>
                  </div>
                  {log.note && (
                    <div className="mt-3 border-t pt-3">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Nota del cambio
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
                        {log.note}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <HistoryIcon
              aria-hidden="true"
              className="mx-auto mb-3 h-6 w-6 text-muted-foreground"
            />
            <p className="text-sm font-medium">
              Sin cambios de estado registrados
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cuando este montacargas cambie de estado, podrás consultar aquí su
              historial.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
