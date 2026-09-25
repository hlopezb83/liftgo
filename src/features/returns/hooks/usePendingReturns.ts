import { useQuery } from "@tanstack/react-query";
import { bookingKeys } from "@/features/bookings";
import { supabase } from "@/integrations/supabase/client";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";
import type { BookingWithForklift } from "@/types/rental";

/**
 * Techo de seguridad (no paginación): una flota con más retornos vencidos que
 * este límite indicaría un problema operativo mucho mayor. A diferencia del
 * listado genérico de bookings (LIST_FETCH_LIMIT ordenado por start_date DESC),
 * aquí el filtro es server-side y el orden por end_date ASC garantiza que los
 * más vencidos nunca queden fuera por truncamiento.
 */
const PENDING_RETURNS_LIMIT = 2000;

/**
 * Retornos pendientes: reservas confirmadas, ya vencidas (end_date < hoy,
 * America/Monterrey) y sin devolución registrada.
 *
 * Filtros server-side alineados con useReturnableBookings y get_dashboard_stats():
 * - status = 'confirmed'
 * - return_status IS NULL
 * - entrega al cliente completada
 * - end_date < hoy en Monterrey (no incluye el día actual)
 */
async function fetchPendingReturns(): Promise<BookingWithForklift[]> {
  const today = todayKeyMty();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, forklifts(name, model), deliveries!deliveries_booking_id_fkey!inner(id)")
    .or(e2eVisibilityFilter())
    .eq("status", "confirmed")
    .is("return_status", null)
    .eq("deliveries.type", "delivery")
    .eq("deliveries.status", "completed")
    .lte("start_date", today)
    .lt("end_date", today)
    .order("end_date", { ascending: true }) // más vencidos primero
    .limit(PENDING_RETURNS_LIMIT);
  if (error) throw error;
  return (data ?? []) as BookingWithForklift[];
}

export function usePendingReturns() {
  return useQuery({
    queryKey: [...bookingKeys.all, "pending-returns"] as const,
    staleTime: 60_000,
    queryFn: fetchPendingReturns,
  });
}
