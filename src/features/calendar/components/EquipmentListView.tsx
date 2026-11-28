
import { parseISO } from "date-fns";
import { useMemo } from "react";
import { ROUTES } from "@/app-routes/routes";
import { StatusBadge } from "@/components/feedback/StatusBadge";
import { ChevronRightIcon } from "@/components/icons";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { computeFleetAvailability, useServerTodayMty } from "@/features/availability";
import type { BookingWithForklift } from "@/features/bookings";
import { RecurringBillingBadge } from "@/features/bookings";
import { rentalDaysInclusive } from "@/features/bookings";
import { useHasModuleAccess } from "@/features/users";
import type { Tables } from "@/integrations/supabase/types";
import { BOOKING_STATUS } from "@/lib/constants";
import { useLocation } from "@/lib/router-compat";
import { Link } from "@/lib/router-compat-ui";
import { formatMtyDate } from "@/lib/utils";

type Forklift = Tables<"forklifts">;

interface EquipmentListViewProps {
  forklifts: Forklift[] | undefined;
  bookings: BookingWithForklift[] | undefined;
  currentBookings: BookingWithForklift[] | undefined;
}

interface EnrichedBooking {
  booking: BookingWithForklift;
  startTs: number;
  endTs: number;
}

// Tanda 2 P1-6: parseISO fuera del render + del comparador de sort.
// Se precalculan una vez y se reusan en filter/sort → sin try/catch en render.
function enrichBookings(bookings: BookingWithForklift[] | undefined): Map<string, EnrichedBooking[]> {
  const map = new Map<string, EnrichedBooking[]>();
  if (!bookings) return map;
  for (const b of bookings) {
    if (b.status !== BOOKING_STATUS.confirmed && b.status !== BOOKING_STATUS.completed) continue;
    const startTs = Date.parse(b.start_date);
    const endTs = Date.parse(b.end_date);
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) continue;
    const entry: EnrichedBooking = { booking: b, startTs, endTs };
    const list = map.get(b.forklift_id);
    if (list) list.push(entry);
    else map.set(b.forklift_id, [entry]);
  }
  return map;
}

export function EquipmentListView({ forklifts, bookings, currentBookings }: EquipmentListViewProps) {
  const canOpenBookings = useHasModuleAccess("Reservas", "read");
  const { pathname, search } = useLocation();
  const calendarReturnTo = canOpenBookings ? pathname + search : undefined;
  const bookingsByForklift = useMemo(() => enrichBookings(bookings), [bookings]);
  // M12: día calendario MTY (YYYY-MM-DD) — los timestamps perdían el último
  // día de la renta (end_date a medianoche < ahora) y el badge "Activa".
  // B-13: NO memoizar con [] — congelaba "hoy" para siempre en sesiones
  // largas (SPA abierta de un día a otro). Se calcula en cada render.
  // R10.9: fecha del servidor; el fallback al reloj local vive dentro del hook.
  const todayYmd = useServerTodayMty();
  // El badge usa el estado físico canónico; una reserva vigente se presenta
  // aparte y no convierte por sí sola la unidad en `rented`.
  const rentedIds = useMemo(
    () => (currentBookings ? computeFleetAvailability(forklifts, currentBookings, todayYmd)?.rentedForkliftIds : undefined),
    [forklifts, currentBookings, todayYmd],
  );

  if (forklifts?.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No hay equipos para mostrar en el calendario.</p>;
  }

  return (
    <div className="space-y-1">
      {forklifts?.map((fl) => {
        const periodBookings = (bookingsByForklift.get(fl.id) ?? [])
          .sort((a, b) => a.startTs - b.startTs);

        return (
          <Collapsible key={fl.id}>
            <CollapsibleTrigger className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between w-full p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors group text-left">
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-sm font-mono font-medium whitespace-nowrap">{fl.name}</span>
                <span className="text-xs text-muted-foreground">{fl.model}</span>
                <StatusBadge
                  status={
                    !rentedIds || (fl.status !== "available" && fl.status !== "rented")
                      ? fl.status
                      : rentedIds.has(fl.id)
                        ? "rented"
                        : "available"
                  }
                />
              </div>
              <div className="pl-6 sm:pl-0 text-xs text-muted-foreground">
                {periodBookings.length > 0 && (
                  <span>{periodBookings.length} reserva{periodBookings.length !== 1 ? "s" : ""} en el periodo</span>
                )}
                {periodBookings.length === 0 && <span>Sin reservas en el periodo</span>}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-7 mt-1 mb-2 space-y-1.5">
                {periodBookings.map(({ booking }) => (
                  <BookingRow
                    key={booking.id}
                    booking={booking}
                    label={bookingListLabel(booking, todayYmd)}
                    calendarReturnTo={calendarReturnTo}
                  />
                ))}
                {periodBookings.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 pl-2">
                    Sin reservas confirmadas ni completadas en este periodo.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}


function bookingListLabel(booking: BookingWithForklift, todayYmd: string): string {
  if (booking.status === BOOKING_STATUS.completed) return "Completada";
  if (booking.start_date <= todayYmd && booking.end_date >= todayYmd) return "Activa";
  if (booking.start_date > todayYmd) return "Programada";
  return "Confirmada";
}

function BookingRow({ booking, label, calendarReturnTo }: { booking: BookingWithForklift; label: string; calendarReturnTo?: string }) {
  const duration = rentalDaysInclusive(parseISO(booking.start_date), parseISO(booking.end_date));
  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between p-2 rounded bg-background border text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className={`text-3xs font-medium px-1.5 py-0.5 rounded ${label === "Activa" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {label}
        </span>
        {booking.booking_number && (calendarReturnTo ? (
          <Link to={ROUTES.bookings.detail(booking.id)} state={{ calendarReturnTo }}
            className="font-medium text-primary underline-offset-4 hover:underline">
            {booking.booking_number}
          </Link>
        ) : <span className="font-medium">{booking.booking_number}</span>)}
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
