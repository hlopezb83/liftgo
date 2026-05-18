import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useBookingStatusHistory(bookingId: string) {
  return useQuery({
    queryKey: ["booking_audit_logs", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("table_name", "bookings")
        .eq("record_id", bookingId)
        .contains("changed_fields", ["status"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
