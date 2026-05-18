import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ProspectInsert, ProspectUpdate } from "./useProspects";

const QUERY_KEY = ["prospects"];

export function useCreateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<ProspectInsert, "stage_order" | "customer_id">) => {
      const { data: existing } = await supabase
        .from("prospects")
        .select("stage_order")
        .eq("stage", p.stage)
        .order("stage_order", { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.stage_order ?? -1) + 1;
      const { data, error } = await supabase
        .from("prospects")
        .insert({ ...p, stage_order: nextOrder })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Prospecto creado");
    },
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });
}

export function useUpdateProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: ProspectUpdate) => {
      const { data, error } = await supabase
        .from("prospects").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });
}

export function useDeleteProspect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prospects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Prospecto eliminado");
    },
    onError: (e: Error) => toast.error("Error", { description: e.message }),
  });
}
