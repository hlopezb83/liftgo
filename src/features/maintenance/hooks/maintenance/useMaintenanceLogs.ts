import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type MaintenanceLog = Tables<"maintenance_logs">;

export function useMaintenanceLogs(forkliftId?: string) {
  return useQuery({
    queryKey: ["maintenance_logs", forkliftId],
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase.from("maintenance_logs").select("*").order("performed_at", { ascending: false }).limit(500);
      if (forkliftId) query = query.eq("forklift_id", forkliftId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: TablesInsert<"maintenance_logs">) => {
      const { data, error } = await supabase.from("maintenance_logs").insert(log).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] }),
    onError: (err: Error) => {
      notifyError({ title: "Error al crear registro de mantenimiento", error: err });
    },
  });
}

export function useUpdateMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<MaintenanceLog>) => {
      const { data, error } = await supabase.from("maintenance_logs").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] }),
  });
}

export function useDeleteMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("maintenance_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] }),
    onError: (err: Error) => {
      notifyError({ title: "Error al eliminar registro de mantenimiento", error: err });
    },
  });
}
