import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";

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

export function useMaintenancePolicies() {
  return useQuery({
    queryKey: ["maintenance_policies"],
    staleTime: 60_000,
    queryFn: async () => {
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
  });
}

export function useCreateMaintenancePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_policies"] });
      notifySuccess("Póliza de mantenimiento creada");
    },
    onError: (err: Error) => notifyError({ error: err }),
  });
}

export function useUpdateMaintenancePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MaintenancePolicy>) => {
      const { data, error } = await supabase
        .from("maintenance_policies")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_policies"] });
      notifySuccess("Póliza actualizada");
    },
    onError: (err: Error) => notifyError({ error: err }),
  });
}

export function useDeleteMaintenancePolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("maintenance_policies")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_policies"] });
      notifySuccess("Póliza eliminada");
    },
    onError: (err: Error) => notifyError({ error: err }),
  });
}
