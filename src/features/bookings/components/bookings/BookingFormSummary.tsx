import { differenceInCalendarDays } from "date-fns";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateMty } from "@/lib/format/dateFormats";

interface BookingFormSummaryProps {
  customerName: string;
  forkliftName: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  recurringBilling: boolean;
}

/** Operational review only: booking capture does not quote rental charges. */
export function BookingFormSummary({ customerName, forkliftName, startDate, endDate, recurringBilling }: BookingFormSummaryProps) {
  const validPeriod = startDate && endDate && toYMD(endDate) >= toYMD(startDate);
  const days = validPeriod ? differenceInCalendarDays(endDate, startDate) + 1 : undefined;

  return (
    <section aria-labelledby="booking-summary-title" className="min-w-0 space-y-2">
      <h2 id="booking-summary-title" className="text-sm font-semibold">Resumen de reserva</h2>
      <dl className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs lg:grid-cols-1 lg:gap-y-1 lg:text-sm">
        <dt className="text-muted-foreground">Equipo</dt>
        <dd className="min-w-0 break-words font-medium lg:mb-2">{forkliftName || "Sin equipo seleccionado"}</dd>
        <dt className="text-muted-foreground">Cliente</dt>
        <dd className="min-w-0 break-words lg:mb-2">{customerName || "Sin cliente"}</dd>
        <dt className="text-muted-foreground">Periodo</dt>
        <dd className="min-w-0 lg:mb-2">
          {startDate && endDate ? `${formatDateMty(toYMD(startDate))} – ${formatDateMty(toYMD(endDate))}` : "Selecciona las fechas"}
          {days !== undefined && <span className="block text-muted-foreground">{days} {days === 1 ? "día de renta" : "días de renta"} · fin incluido</span>}
        </dd>
      </dl>
      {recurringBilling && <p className="text-xs text-muted-foreground">Incluida en facturación mensual</p>}
    </section>
  );
}
