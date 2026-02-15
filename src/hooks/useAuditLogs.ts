import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_fields: string[] | null;
  user_id: string | null;
  created_at: string;
  // joined
  user_email?: string;
}

export function useAuditLogs(filters?: { table_name?: string; record_id?: string }) {
  return useQuery({
    queryKey: ["audit_logs", filters],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (filters?.table_name) query = query.eq("table_name", filters.table_name);
      if (filters?.record_id) query = query.eq("record_id", filters.record_id);

      const { data, error } = await query;
      if (error) throw error;

      // Batch fetch user emails for display
      const logs = data as unknown as AuditLog[];
      const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))] as string[];

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p.full_name]));
        logs.forEach((l) => {
          if (l.user_id) l.user_email = profileMap.get(l.user_id) || "Unknown";
        });
      }

      return logs;
    },
  });
}
