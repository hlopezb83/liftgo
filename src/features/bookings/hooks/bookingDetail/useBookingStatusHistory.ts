import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { bookingKeys } from "../../lib/queryKeys";

export interface BookingHistoryLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
  user_name?: string;
}

export function useBookingStatusHistory(bookingId: string) {
  return useQuery({
    queryKey: bookingKeys.auditLogs(bookingId),
    enabled: !!bookingId,
    queryFn: async (): Promise<BookingHistoryLog[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select(AUDIT_LOG_COLUMNS)
        .eq("table_name", "bookings")
        .eq("record_id", bookingId)
        .order("created_at", { ascending: false })
        .returns<Tables<"audit_logs">[]>();
      if (error) throw error;

      const logs = (data ?? []) as unknown as BookingHistoryLog[];
      const userIds = [
        ...new Set(logs.map((l) => l.user_id).filter(Boolean)),
      ] as string[];

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);
        const map = new Map(
          (profiles ?? []).map((p) => [p.user_id, p.full_name]),
        );
        logs.forEach((l) => {
          if (l.user_id) l.user_name = map.get(l.user_id) ?? "Desconocido";
        });
      }

      return logs;
    },
  });
}
