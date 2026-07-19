import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { maintenanceLogKeys } from "../../lib/queryKeys";

export type MaintenanceLabor = Tables<"maintenance_labor"> & {
  mechanics?: { id: string; name: string } | null;
};

export const maintenanceLaborKeys = createEntityKeys("maintenance_labor");

export function useMaintenanceLabor(maintenanceLogId: string | null | undefined) {
  return useQuery({
    queryKey: maintenanceLaborKeys.list({ maintenanceLogId }),
    enabled: Boolean(maintenanceLogId),
    staleTime: 30_000,
    queryFn: async (): Promise<MaintenanceLabor[]> => {
      const { data, error } = await supabase
        .from("maintenance_labor")
        .select("*, mechanics(id, name)")
        .eq("maintenance_log_id", maintenanceLogId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MaintenanceLabor[];
    },
  });
}

type LaborInsert = Omit<TablesInsert<"maintenance_labor">, "id" | "created_at" | "updated_at" | "total_cost">;

export function useAddMaintenanceLabor() {
  return useEntityMutation({
    mutationFn: async (row: LaborInsert) => {
      const { data, error } = await supabase
        .from("maintenance_labor")
        .insert(row)
        .select("*, mechanics(id, name)")
        .single();
      if (error) throw error;
      return data as MaintenanceLabor;
    },
    invalidateKeys: [maintenanceLaborKeys.all, maintenanceLogKeys.all],
    errorTitle: "Error al agregar mano de obra",
  });
}

export function useDeleteMaintenanceLabor() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_labor").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [maintenanceLaborKeys.all, maintenanceLogKeys.all],
    errorTitle: "Error al eliminar mano de obra",
  });
}
