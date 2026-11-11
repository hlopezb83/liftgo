import { differenceInCalendarDays } from "date-fns";
import { useId, useState, type MouseEvent } from "react";
import { ChevronDownIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { toYMD } from "@/lib/date/toYMD";
import { formatDateMty } from "@/lib/format/dateFormats";
import { cn } from "@/lib/utils";

interface BookingFormSummaryProps {
  customerName: string;
  forkliftName: string;
  startDate: Date | undefined;
  endDate: Date | undefined;
  recurringBilling: boolean;
}

/** Operational review only: booking capture does not quote rental charges. */
export function BookingFormSummary({ customerName, forkliftName, startDate, endDate, recurringBilling }: BookingFormSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
  const validPeriod = startDate && endDate && toYMD(endDate) >= toYMD(startDate);
  const days = validPeriod ? differenceInCalendarDays(endDate, startDate) + 1 : undefined;
  const toggleSummary = (event: MouseEvent<HTMLButtonElement>) => {
    const section = event.currentTarget.parentElement;
    setExpanded((current) => !current);
    // Expanding releases the mobile sticky bar. Keep the same review and
    // focused trigger on screen after it returns to the form's document flow.
    requestAnimationFrame(() => {
      if (section?.isConnected) section.scrollIntoView({ block: "nearest" });
    });
  };

  return (
    <section aria-labelledby={`${summaryId}-title`} data-expanded={expanded} className="min-w-0 lg:space-y-2">
      <h2 id={`${summaryId}-title`} className="hidden text-sm font-semibold lg:block">Resumen de reserva</h2>
      <Button type="button" variant="ghost" aria-expanded={expanded} aria-controls={summaryId} onClick={toggleSummary} className="h-11 w-full justify-between px-1 lg:hidden">
        Resumen de reserva
        <ChevronDownIcon aria-hidden="true" className={cn("h-4 w-4 shrink-0", expanded && "rotate-180")} />
      </Button>
      <div id={summaryId} className={cn("space-y-2", !expanded && "hidden lg:block")}>
        <dl className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs lg:grid-cols-1 lg:gap-y-1 lg:text-sm">
          <dt className="text-muted-foreground">Equipo</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere] font-medium lg:mb-2">{forkliftName || "Sin equipo seleccionado"}</dd>
          <dt className="text-muted-foreground">Cliente</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere] lg:mb-2">{customerName || "Sin cliente"}</dd>
          <dt className="text-muted-foreground">Periodo</dt>
          <dd className="min-w-0 lg:mb-2">
            {startDate && endDate ? `${formatDateMty(toYMD(startDate))} – ${formatDateMty(toYMD(endDate))}` : "Selecciona las fechas"}
            {days !== undefined && <span className="block text-muted-foreground">{days} {days === 1 ? "día de renta" : "días de renta"} · fin incluido</span>}
          </dd>
        </dl>
        {recurringBilling && <p className="text-xs text-muted-foreground">Incluida en facturación mensual</p>}
      </div>
    </section>
  );
}
