import { useQuery } from "@tanstack/react-query";
import { bookingKeys } from "@/features/bookings";
import { supabase } from "@/integrations/supabase/client";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { e2eVisibilityFilter, LIST_FETCH_LIMIT } from "@/lib/supabase/constants";

interface Options {
  early: boolean;
  bookingId?: string | null;
  enabled: boolean;
}

/** Eligibility is filtered before the list limit; RLS remains authoritative. */
export function useReturnableBookings({ early, bookingId, enabled }: Options) {
  const today = todayKeyMty();
  return useQuery({
    queryKey: bookingKeys.list({ purpose: "return-inspection", early, bookingId: bookingId ?? null, today }),
    enabled,
    staleTime: 0,
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select("*, deliveries!deliveries_booking_id_fkey!inner(id)")
        .eq("status", "confirmed")
        .is("return_status", null)
        .eq("deliveries.type", "delivery")
        .eq("deliveries.status", "completed")
        .lte("start_date", today)
        .or(e2eVisibilityFilter());
      if (!early) query = query.lte("end_date", today);
      if (bookingId) query = query.eq("id", bookingId);
      const { data, error } = await query
        .order("end_date", { ascending: true })
        .order("id", { ascending: true })
        .limit(LIST_FETCH_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });
}
