
import { parseISO, isWithinInterval } from "date-fns";
import { FleetIcon, SuccessIcon, MaintenanceIcon, ChartIcon } from "@/components/icons";
import type { BookingWithForklift } from "@/features/bookings";
import { StatCards } from "@/features/dashboard";
import type { Tables } from "@/integrations/supabase/types";
import { BOOKING_STATUS, FORKLIFT_STATUS } from "@/lib/constants";
import { nowMty } from "@/lib/utils";

type Forklift = Tables<"forklifts">;

interface CalendarStatCardsProps {
  forklifts: Forklift[] | undefined;
  bookings: BookingWithForklift[] | undefined;
}

export function CalendarStatCards({ forklifts, bookings }: CalendarStatCardsProps) {
  const stats = (() => {
    if (!forklifts) return { available: 0, rented: 0, maintenance: 0, utilization: "0%" };

    const today = nowMty();
    const activeBookingForkliftIds = new Set<string>();
    bookings?.forEach((b) => {
      if (b.status === BOOKING_STATUS.confirmed) {
        try {
          const start = parseISO(b.start_date);
          const end = parseISO(b.end_date);
          if (isWithinInterval(today, { start, end })) {
            activeBookingForkliftIds.add(b.forklift_id);
          }
        } catch { /* skip invalid dates */ }
      }
    });

    const available = forklifts.filter(
      (f) => f.status === FORKLIFT_STATUS.available && !activeBookingForkliftIds.has(f.id)
    ).length;
    const rented = forklifts.filter(
      (f) => f.status === FORKLIFT_STATUS.rented || activeBookingForkliftIds.has(f.id)
    ).length;
    const maintenance = forklifts.filter((f) => f.status === FORKLIFT_STATUS.maintenance).length;
    const totalActive = forklifts.filter((f) => f.status !== FORKLIFT_STATUS.retired && f.status !== FORKLIFT_STATUS.sold).length;
    const utilization = totalActive > 0 ? Math.round((rented / totalActive) * 100) : 0;

    return { available, rented, maintenance, utilization: `${utilization}%` };
  })();

  const cards = [
    { label: "Disponibles", value: stats.available, icon: SuccessIcon, color: "text-success" },
    { label: "Rentados", value: stats.rented, icon: FleetIcon, color: "text-info" },
    { label: "Mantenimiento", value: stats.maintenance, icon: MaintenanceIcon, color: "text-warning" },
    { label: "Utilización", value: stats.utilization, icon: ChartIcon, color: "text-chart-5" },
  ];

  return <StatCards cards={cards} />;
}
