import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type MaintenanceLog = Tables<"maintenance_logs">;

export function useMaintenanceLogs(forkliftId?: string) {
  return useQuery({
    queryKey: ["maintenance_logs", forkliftId],
    queryFn: async () => {
      let query = supabase.from("maintenance_logs").select("*").order("performed_at", { ascending: false });
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data as MaintenanceLog[];
    },
  });
}

export function useCreateMaintenanceLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (log: TablesInsert<"maintenance_logs">) => {
      const { data, error } = await supabase.from("maintenance_logs").insert(log).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance_logs"] }),
  });
}
