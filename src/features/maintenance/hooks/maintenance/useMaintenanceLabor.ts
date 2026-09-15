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
    queryKey: maintenanceLaborKeys.byFilter({ maintenanceLogId }),
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

// Tramo 4: la empresa la asigna el trigger de contexto, nunca el formulario.
type LaborInsert = Omit<
  TablesInsert<"maintenance_labor">,
  "id" | "created_at" | "updated_at" | "total_cost" | "organization_id"
>;

export function useAddMaintenanceLabor() {
  return useEntityMutation({
    mutationFn: async (row: LaborInsert) => {
      const { data, error } = await supabase
        .from("maintenance_labor")
        .insert(stripOrganizationId(row) as TablesInsert<"maintenance_labor">)
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
