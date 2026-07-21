import { addMonths, parseISO, startOfMonth } from "date-fns";
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
  // BL-1.5 R5: la generación real (edge fn `generate-recurring-invoices`)
  // alinea el siguiente cargo al inicio del mes calendario siguiente al
  // último periodo facturado. Mostrar `addMonths(lastBilled, 1)` mentía
  // el día — usamos `startOfMonth(addMonths(anchor, 1))`.
  const anchor = lastBilled ?? parseISO(booking.start_date);
  const nextBilling = startOfMonth(addMonths(anchor, 1));

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
