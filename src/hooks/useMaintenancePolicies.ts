import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_policies" as any)
        .select("*, forklifts(name, status)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]).map((p) => ({
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
        .from("maintenance_policies" as any)
        .insert(policy as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance_policies"] });
      toast.success("Póliza de mantenimiento creada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateMaintenancePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MaintenancePolicy>) => {
      const { data, error } = await supabase
        .from("maintenance_policies" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance_policies"] });
      toast.success("Póliza actualizada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteMaintenancePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("maintenance_policies" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance_policies"] });
      toast.success("Póliza eliminada");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
