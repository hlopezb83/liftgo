import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";
import { EXCLUDE_E2E_FILTER, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { bookingKeys } from "../lib/queryKeys";
export type { Booking, BookingWithForklift } from "@/types/rental";

export function useBookings(forkliftId?: string) {
  return useQuery({
    queryKey: forkliftId ? bookingKeys.byForklift(forkliftId) : bookingKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
        .or(EXCLUDE_E2E_FILTER)
        .order("start_date", { ascending: false })
        .limit(LIST_PAGE_LIMIT);
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Variante de useBookings con filtro server-side por rango de fechas.
 * Útil para Calendario / Dashboard donde solo importan reservas que se traslapan con un periodo.
 * Trae reservas donde end_date >= from AND start_date <= to.
 */
export function useBookingsRange(from: string | Date, to: string | Date) {
  const fromStr = typeof from === "string" ? from : toYMD(from);
  const toStr = typeof to === "string" ? to : toYMD(to);

  return useQuery({
    queryKey: [...bookingKeys.all, "range", fromStr, toStr] as const,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
        .or(EXCLUDE_E2E_FILTER)
        .gte("end_date", fromStr)
        .lte("start_date", toStr)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useBooking(bookingId?: string) {
  return useQuery({
    queryKey: bookingId ? bookingKeys.detail(bookingId) : bookingKeys.details(),
    enabled: !!bookingId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
        .eq("id", bookingId ?? "")
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export {
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
  useCancelBooking,
} from "./useBookingMutations";
