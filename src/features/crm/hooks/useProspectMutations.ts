import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { prospectKeys } from "../lib/queryKeys";
import type { ProspectInsert, ProspectUpdate } from "./useProspects";

export function useCreateProspect() {
  return useEntityMutation({
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
    invalidateKeys: [prospectKeys.all],
    successMsg: "Prospecto creado",
    errorTitle: "Error al crear prospecto",
  });
}

export function useUpdateProspect() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: ProspectUpdate) => {
      const { data, error } = await supabase
        .from("prospects").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [prospectKeys.all],
    errorTitle: "Error al actualizar prospecto",
  });
}

export function useDeleteProspect() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("prospects").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [prospectKeys.all],
    successMsg: "Prospecto eliminado",
    errorTitle: "Error al eliminar prospecto",
  });
}
