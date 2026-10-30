import { differenceInDays, parseISO } from "date-fns";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { CalendarDays, FleetIcon } from "@/components/icons";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateMty } from "@/lib/format/dateFormats";

interface Props {
  name: string;
  model: string;
  startDate: string;
  endDate: string;
  status: string;
}

/** Keep the operational essentials together before contacts and billing. */
export function BookingSummaryCard({ name, model, startDate, endDate, status }: Props) {
  // Both dates count as rental days, including a one-day reservation.
  const duration = Math.max(1, differenceInDays(parseISO(endDate), parseISO(startDate)) + 1);

  return (
    <Card role="region" aria-label="Resumen de la reserva">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Resumen de la reserva</h2>
          <div><span className="sr-only">Estado: </span><StatusBadge status={status} /></div>
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-2 md:gap-6">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <FleetIcon className="h-3.5 w-3.5 shrink-0" aria-hidden /> Equipo
            </p>
            <p className="break-words text-sm font-semibold">{name || "-"}</p>
            <p className="mt-1 break-words text-sm text-muted-foreground">{model || "-"}</p>
          </div>
          <div className="min-w-0 border-t pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /> Periodo de renta
              </p>
              <p className="font-medium">{duration} día{duration !== 1 ? "s" : ""}</p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Inicio</dt>
                <dd className="mt-1 font-medium"><time dateTime={startDate}>{formatDateMty(startDate)}</time></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Fin</dt>
                <dd className="mt-1 font-medium"><time dateTime={endDate}>{formatDateMty(endDate)}</time></dd>
              </div>
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
