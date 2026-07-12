import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { maintenancePolicyKeys } from "../../lib/queryKeys";

export interface MaintenancePolicy {
  id: string;
  forklift_id: string;
  provider_name: string;
  monthly_cost: number;
  service_type: string;
  description: string | null;
  is_active: boolean;
  last_generated_month: string | null;
  created_at: string;
  updated_at: string;
  forklift_name?: string;
  forklift_status?: string;
}

export const maintenancePolicyQueries = defineEntityQueries<"maintenance_policies", MaintenancePolicy[], never>(
  "maintenance_policies",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("maintenance_policies")
        .select("*, forklifts(name, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        forklift_name: p.forklifts?.name ?? "",
        forklift_status: p.forklifts?.status ?? "",
      })) as MaintenancePolicy[];
    },
  },
);

export function useMaintenancePolicies() {
  return useQuery(maintenancePolicyQueries.list());
}

export function useCreateMaintenancePolicy() {
  return useEntityMutation({
    mutationFn: async (policy: {
      forklift_id: string;
      provider_name: string;
      monthly_cost: number;
      service_type: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from("maintenance_policies")
        .insert(policy)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [maintenancePolicyKeys.all],
    successMsg: "Póliza de mantenimiento creada",
    errorTitle: "Error al crear póliza",
  });
}

export function useUpdateMaintenancePolicy() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MaintenancePolicy>) => {
      // Excluir campos sintéticos (joins) que no son columnas reales.
      const { forklift_name: _fn, forklift_status: _fs, ...dbUpdates } = updates;
      void _fn;
      void _fs;
      const { data, error } = await supabase
        .from("maintenance_policies")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [maintenancePolicyKeys.all],
    successMsg: "Póliza actualizada",
    errorTitle: "Error al actualizar póliza",
  });
}

export function useDeleteMaintenancePolicy() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("maintenance_policies")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [maintenancePolicyKeys.all],
    successMsg: "Póliza eliminada",
    errorTitle: "Error al eliminar póliza",
  });
}
