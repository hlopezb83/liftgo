import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export type { Booking, BookingWithForklift } from "@/types/rental";

export function useBookings(forkliftId?: string) {
  return useQuery({
    queryKey: ["bookings", forkliftId],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase.from("bookings").select("*, forklifts(name, model)").order("start_date", { ascending: false }).limit(500);
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
  const fromStr = typeof from === "string" ? from : from.toISOString().slice(0, 10);
  const toStr = typeof to === "string" ? to : to.toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["bookings", "range", fromStr, toStr],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, forklifts(name, model)")
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
    queryKey: ["booking", bookingId],
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
