import { addMonths, parseISO } from "date-fns";
import { Repeat } from "@/components/icons";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatDateMty } from "@/lib/format/dateFormats";
import type { Booking } from "../../hooks/useBookings";

interface RecurringBillingBadgeProps {
  booking: Pick<Booking, "recurring_billing" | "last_billed_date" | "start_date">;
}

export function RecurringBillingBadge({ booking }: RecurringBillingBadgeProps) {
  if (!booking.recurring_billing) return null;

  const lastBilled = booking.last_billed_date ? parseISO(booking.last_billed_date) : null;
  // BLOQUE 3.3: el ciclo real es por mes calendario (ver
  // mem://logic/recurring-billing-cycle). El +30 días desalineaba la próxima
  // fecha mostrada respecto a la generación real (podía adelantarse o
  // atrasarse ~1 día por mes acumulado).
  const nextBilling = addMonths(lastBilled ?? parseISO(booking.start_date), 1);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary cursor-default">
          <Repeat className="h-3 w-3" />
          Recurrente
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs space-y-1">
        <p>
          <span className="text-muted-foreground">Últ. factura:</span>{" "}
           {lastBilled ? formatDateMty(lastBilled) : "Sin facturar aún"}
        </p>
        <p>
          <span className="text-muted-foreground">Próx. factura:</span>{" "}
          {formatDateMty(nextBilling)}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
