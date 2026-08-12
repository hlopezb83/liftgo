import { useQuery } from "@tanstack/react-query";
import { bookingKeys } from "@/features/bookings";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";
import { e2eVisibilityFilter } from "@/lib/supabase/constants";
import { nowMty } from "@/lib/utils";
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
 * Filtros server-side alineados con get_dashboard_stats():
 * - status = 'confirmed'
 * - return_status IS DISTINCT FROM 'returned' → `.or("return_status.is.null,return_status.neq.returned")`
 *   (un `.neq` simple excluiría los NULL, que son precisamente los pendientes)
 * - end_date < CURRENT_DATE (no incluye el día actual)
 */
async function fetchPendingReturns(): Promise<BookingWithForklift[]> {
  const today = toYMD(nowMty());
  const { data, error } = await supabase
    .from("bookings")
    .select("*, forklifts(name, model)")
    .or(e2eVisibilityFilter())
    .eq("status", "confirmed")
    .or("return_status.is.null,return_status.neq.returned")
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
