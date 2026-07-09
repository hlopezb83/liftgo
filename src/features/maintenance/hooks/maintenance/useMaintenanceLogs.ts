import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { maintenanceLogKeys } from "../../lib/queryKeys";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type MaintenanceLog = Tables<"maintenance_logs">;

export function useMaintenanceLogs(forkliftId?: string) {
  return useQuery({
    queryKey: [...maintenanceLogKeys.all, forkliftId] as const,
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase.from("maintenance_logs").select("*").is("deleted_at", null).order("performed_at", { ascending: false }).limit(500);
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateMaintenanceLog() {
  return useEntityMutation({
    mutationFn: async (log: TablesInsert<"maintenance_logs">) => {
      const { data, error } = await supabase.from("maintenance_logs").insert(log).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [maintenanceLogKeys.all],
    errorTitle: "Error al crear registro de mantenimiento",
  });
}

export function useUpdateMaintenanceLog() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MaintenanceLog>) => {
      const { data, error } = await supabase.from("maintenance_logs").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [maintenanceLogKeys.all],
    errorTitle: "Error al actualizar registro de mantenimiento",
  });
}

export function useDeleteMaintenanceLog() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("soft_delete_maintenance_log", { p_log_id: id });
      if (error) throw error;
    },
    invalidateKeys: [maintenanceLogKeys.all],
    errorTitle: "Error al archivar registro de mantenimiento",
  });
}
