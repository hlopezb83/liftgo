import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { e2eVisibilityFilter, LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { bookingKeys } from "../../lib/queryKeys";
export type { Booking, BookingWithForklift } from "@/types/rental";

/**
 * Límite del listado por rango (drilldown de utilización / calendario).
 * El hook pide BOOKINGS_RANGE_LIMIT + 1 filas para distinguir "2000 exactas" de
 * "truncado" (mismo patrón que LIST_FETCH_LIMIT/LIST_PAGE_LIMIT): el consumidor
 * recorta a BOOKINGS_RANGE_LIMIT y muestra un aviso si length > límite.
 */
export const BOOKINGS_RANGE_LIMIT = 2000;

type BookingListRow = Awaited<ReturnType<typeof fetchBookingList>>[number];
type BookingDetailRow = Awaited<ReturnType<typeof fetchBookingDetail>>;

async function fetchBookingList(forkliftId?: string) {
  let query = supabase
    .from("bookings")
    .select("*, forklifts(name, model)")
    .or(e2eVisibilityFilter())
    .order("start_date", { ascending: false })
    .limit(LIST_FETCH_LIMIT);
  if (forkliftId) query = query.eq("forklift_id", forkliftId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function fetchBookingDetail(id: string) {
  const { data, error } = await supabase
    .from("bookings")
    .select("*, forklifts(name, model)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export const bookingQueries = defineEntityQueries<"bookings", BookingListRow[], BookingDetailRow>(
  "bookings",
  {
    list: (filter) => {
      const forkliftId = filter?.forkliftId as string | undefined;
      return () => fetchBookingList(forkliftId);
    },
    detail: (id) => () => fetchBookingDetail(id),
  },
);

export function useBookings(forkliftId?: string) {
  // Mantiene el key legacy `bookingKeys.byForklift(id)` para no romper invalidaciones
  // dispersas y prefetches en calendarios; el listado plano usa el key canónico.
  const listOptions = bookingQueries.list();
  return useQuery(
    forkliftId
      ? {
          queryKey: bookingKeys.byForklift(forkliftId),
          staleTime: 60_000,
          queryFn: () => fetchBookingList(forkliftId),
        }
      : listOptions,
  );
}

/**
 * Variante de useBookings con filtro server-side por rango de fechas.
 * Útil para Calendario / Dashboard donde solo importan reservas que se traslapan con un periodo.
 */
export function useBookingsRange(from: string | Date, to: string | Date) {
  const fromStr = typeof from === "string" ? from : toYMD(from);
  const toStr = typeof to === "string" ? to : toYMD(to);

  return useQuery({
    queryKey: [...bookingKeys.range(), fromStr, toStr] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
        .or(e2eVisibilityFilter())
        .gte("end_date", fromStr)
        .lte("start_date", toStr)
        .order("start_date", { ascending: true })
        .limit(BOOKINGS_RANGE_LIMIT + 1); // +1: detectar truncamiento real
      if (error) throw error;
      return data;
    },
  });
}

export function useBooking(bookingId?: string) {
  return useQuery({
    ...bookingQueries.detail(bookingId ?? ""),
    enabled: !!bookingId,
  });
}

export {
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
  useCancelBooking,
} from "./useBookingMutations";
