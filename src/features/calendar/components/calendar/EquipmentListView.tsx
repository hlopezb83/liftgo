
import { parseISO, isWithinInterval } from "date-fns";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronRightIcon } from "@/components/icons";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { BookingWithForklift } from "@/features/bookings";
import { RecurringBillingBadge } from "@/features/bookings";
import { rentalDaysInclusive } from "@/features/bookings";
import type { Tables } from "@/integrations/supabase/types";
import { BOOKING_STATUS } from "@/lib/constants";
import { nowMty, formatMtyDate } from "@/lib/utils";

type Forklift = Tables<"forklifts">;

interface EquipmentListViewProps {
  forklifts: Forklift[] | undefined;
  bookings: BookingWithForklift[] | undefined;
}

export function EquipmentListView({ forklifts, bookings }: EquipmentListViewProps) {
  const bookingsByForklift = (() => {
    const map = new Map<string, BookingWithForklift[]>();
    bookings?.forEach((b) => {
      if (b.status !== BOOKING_STATUS.confirmed && b.status !== BOOKING_STATUS.completed) return;
      const list = map.get(b.forklift_id);
      if (list) list.push(b);
      else map.set(b.forklift_id, [b]);
    });
    return map;
  })();

  const today = nowMty();

  return (
    <div className="space-y-1">
      {forklifts?.map((fl) => {
        const flBookings = bookingsByForklift.get(fl.id) || [];
        const activeBooking = flBookings.find((b) => {
          try {
            return b.status === BOOKING_STATUS.confirmed && isWithinInterval(today, { start: parseISO(b.start_date), end: parseISO(b.end_date) });
          } catch { return false; }
        });
        const upcoming = flBookings
          .filter((b) => parseISO(b.start_date) > today && b.status === BOOKING_STATUS.confirmed)
          .sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime());

        return (
          <Collapsible key={fl.id}>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors group text-left">
              <div className="flex items-center gap-3">
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-sm font-mono font-medium">{fl.name}</span>
                <span className="text-xs text-muted-foreground">{fl.model}</span>
                <StatusBadge status={fl.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {activeBooking && <span className="text-primary font-medium">Rentado</span>}
                {upcoming.length > 0 && <span>{upcoming.length} próxima{upcoming.length !== 1 ? "s" : ""}</span>}
                {!activeBooking && upcoming.length === 0 && <span>Sin reservas</span>}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-7 mt-1 mb-2 space-y-1.5">
                {activeBooking && (
                  <BookingRow booking={activeBooking} label="Activa" />
                )}
                {upcoming.map((b) => (
                  <BookingRow key={b.id} booking={b} label="Próxima" />
                ))}
                {!activeBooking && upcoming.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 pl-2">Sin reservas activas ni programadas.</p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function BookingRow({ booking, label }: { booking: BookingWithForklift; label: string }) {
  const duration = rentalDaysInclusive(parseISO(booking.start_date), parseISO(booking.end_date));
  return (
    <div className="flex items-center justify-between p-2 rounded bg-background border text-sm">
      <div className="flex items-center gap-2">
        <span className={`text-3xs font-medium px-1.5 py-0.5 rounded ${label === "Activa" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {label}
        </span>
        <span className="font-medium">{booking.customer_name || "Sin cliente"}</span>
        <RecurringBillingBadge booking={booking} />
      </div>
      <div className="text-xs text-muted-foreground">
        {formatMtyDate(booking.start_date, "dd/MM")} → {formatMtyDate(booking.end_date)}
        <span className="ml-2">{duration}d</span>
      </div>
    </div>
  );
}
