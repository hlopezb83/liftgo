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
      const now = new Date().toISOString();
      let query = supabase
        .from("bookings")
        .select("*, deliveries!deliveries_booking_id_fkey!inner(id, type, status, completed_at), actual_delivery:deliveries!deliveries_booking_id_fkey(id)")
        .eq("status", "confirmed")
        .is("return_status", null)
        .eq("deliveries.type", "delivery")
        .eq("deliveries.status", "completed")
        .or(`completed_at.is.null,completed_at.lte.${now}`, { referencedTable: "deliveries" })
        .eq("actual_delivery.type", "delivery")
        .eq("actual_delivery.status", "completed")
        .lte("actual_delivery.completed_at", now)
        // Filter eligibility BEFORE LIMIT. Null historical timestamps remain
        // eligible after commercial start; only real early delivery bypasses it.
        .or(`and(or(${e2eVisibilityFilter()}),or(start_date.lte.${today},actual_delivery.not.is.null))`);
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
