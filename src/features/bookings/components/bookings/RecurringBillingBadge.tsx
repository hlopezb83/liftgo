import { addMonths, startOfMonth } from "date-fns";
import { Repeat } from "@/components/icons";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatDateMty } from "@/lib/format/dateFormats";
import { parseDateLocal } from "@/lib/utils";
import type { Booking } from "../../hooks/bookings/useBookings";

interface RecurringBillingBadgeProps {
  booking: Pick<Booking, "recurring_billing" | "last_billed_date" | "start_date"> & {
    status?: string | null;
  };
}

/** Bloque 3B: una reserva cerrada ya no genera ciclos: no se muestra "Recurrente". */
const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

export function RecurringBillingBadge({ booking }: RecurringBillingBadgeProps) {
  if (!booking.recurring_billing) return null;
  if (booking.status && CLOSED_STATUSES.has(booking.status)) return null;

  // R6-B2: `parseISO("YYYY-MM-DD")` interpreta UTC-00:00 y en TZ negativa
  // (Monterrey UTC-6) retrocede al día anterior. `parseDateLocal` preserva
  // el calendario local, evitando desfases al calcular el próximo cargo.
  const lastBilled = parseDateLocal(booking.last_billed_date);
  const anchor = lastBilled ?? parseDateLocal(booking.start_date);
  const nextBilling = anchor ? startOfMonth(addMonths(anchor, 1)) : null;

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
          {nextBilling ? formatDateMty(nextBilling) : "—"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
