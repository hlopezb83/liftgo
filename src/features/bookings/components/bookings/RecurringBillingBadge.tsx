import { format, addDays, parseISO } from "date-fns";
import { Repeat } from "@/components/icons";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Booking } from "../../hooks/useBookings";

interface RecurringBillingBadgeProps {
  booking: Pick<Booking, "recurring_billing" | "last_billed_date" | "start_date">;
}

export function RecurringBillingBadge({ booking }: RecurringBillingBadgeProps) {
  if (!booking.recurring_billing) return null;

  const lastBilled = booking.last_billed_date ? parseISO(booking.last_billed_date) : null;
  const nextBilling = addDays(lastBilled ?? parseISO(booking.start_date), 30);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary cursor-default">
          <Repeat className="h-3 w-3" />
          Recurrente
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs space-y-1">
        <p>
          <span className="text-muted-foreground">Últ. factura:</span>{" "}
           {lastBilled ? format(lastBilled, "dd/MM/yyyy") : "Sin facturar aún"}
        </p>
        <p>
          <span className="text-muted-foreground">Próx. factura:</span>{" "}
          {format(nextBilling, "dd/MM/yyyy")}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
