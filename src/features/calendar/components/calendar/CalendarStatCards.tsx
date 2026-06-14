import { useMemo } from "react";
import { StatCards } from "@/features/dashboard";
import { Truck, CheckCircle, Wrench, BarChart3 } from "lucide-react";
import type { BookingWithForklift } from "@/features/bookings";
import type { Tables } from "@/integrations/supabase/types";
import { parseISO, isWithinInterval } from "date-fns";
import { nowMty } from "@/lib/utils";
import { BOOKING_STATUS, FORKLIFT_STATUS } from "@/lib/constants";


type Forklift = Tables<"forklifts">;

interface CalendarStatCardsProps {
  forklifts: Forklift[] | undefined;
  bookings: BookingWithForklift[] | undefined;
}

export function CalendarStatCards({ forklifts, bookings }: CalendarStatCardsProps) {
  const stats = useMemo(() => {
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
  }, [forklifts, bookings]);

  const cards = [
    { label: "Disponibles", value: stats.available, icon: CheckCircle, color: "text-emerald-600" },
    { label: "Rentados", value: stats.rented, icon: Truck, color: "text-blue-600" },
    { label: "Mantenimiento", value: stats.maintenance, icon: Wrench, color: "text-amber-600" },
    { label: "Utilización", value: stats.utilization, icon: BarChart3, color: "text-violet-600" },
  ];

  return <StatCards cards={cards} />;
}
