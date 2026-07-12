import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { maintenanceLogKeys } from "../../lib/queryKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type MaintenanceLog = Tables<"maintenance_logs">;

export const maintenanceLogQueries = defineEntityQueries<"maintenance_logs", MaintenanceLog[], never>(
  "maintenance_logs",
  {
    list: (filter) => async () => {
      const forkliftId = filter?.forkliftId as string | undefined;
      let q = supabase
        .from("maintenance_logs")
        .select("*")
        .is("deleted_at", null)
        .order("performed_at", { ascending: false })
        .limit(500);
      if (forkliftId) q = q.eq("forklift_id", forkliftId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  },
);

export function useMaintenanceLogs(forkliftId?: string) {
  return useQuery(maintenanceLogQueries.list({ forkliftId: forkliftId ?? null }));
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
