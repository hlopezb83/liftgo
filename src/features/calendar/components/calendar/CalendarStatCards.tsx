
import { FleetIcon, SuccessIcon, MaintenanceIcon, ChartIcon } from "@/components/icons";
import { computeFleetAvailability, useServerTodayMty } from "@/features/availability";
import type { BookingWithForklift } from "@/features/bookings";
import { StatCards } from "@/features/dashboard";
import type { Tables } from "@/integrations/supabase/types";

type Forklift = Tables<"forklifts">;

interface CalendarStatCardsProps {
  forklifts: Forklift[] | undefined;
  bookings: BookingWithForklift[] | undefined;
}

export function CalendarStatCards({ forklifts, bookings }: CalendarStatCardsProps) {
  // R10.9: "hoy" resuelto en el servidor (TZ Monterrey), no el reloj del navegador.
  const todayYmd = useServerTodayMty();
  const stats = (() => {
    // R6-FE-07: una sola definición compartida (fleetAvailability).
    const a = computeFleetAvailability(forklifts, bookings, todayYmd);
    if (!a) return { available: 0, rented: 0, maintenance: 0, utilization: "0%" };
    const utilization = a.totalActive > 0 ? Math.round((a.rented / a.totalActive) * 100) : 0;
    return { available: a.available, rented: a.rented, maintenance: a.maintenance, utilization: `${utilization}%` };
  })();

  const cards = [
    { label: "Disponibles", value: stats.available, icon: SuccessIcon, color: "text-success" },
    { label: "Rentados", value: stats.rented, icon: FleetIcon, color: "text-info" },
    { label: "Mantenimiento", value: stats.maintenance, icon: MaintenanceIcon, color: "text-warning" },
    { label: "Utilización", value: stats.utilization, icon: ChartIcon, color: "text-chart-5" },
  ];

  return <StatCards cards={cards} />;
}
