import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { PartInventory } from "./usePartsInventory";

export function useCreatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (part: TablesInsert<"parts_inventory">) => {
      const { data, error } = await supabase
        .from("parts_inventory").insert(part).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["parts_inventory"] }),
    onError: (err: Error) => notifyError({ title: "Error al crear refacción", error: err }),
  });
}

export function useUpdatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PartInventory>) => {
      const { data, error } = await supabase
        .from("parts_inventory").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["parts_inventory"] }),
  });
}

export function useDeletePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parts_inventory").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["parts_inventory"] }),
    onError: (err: Error) => notifyError({ title: "Error al eliminar refacción", error: err }),
  });
}

export function useAddMaintenancePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: TablesInsert<"maintenance_parts"> & { currentLogCost?: number }) => {
      const { currentLogCost, ...insertRow } = row;

      const { data, error } = await supabase
        .from("maintenance_parts").insert(insertRow).select().single();
      if (error) throw error;

      const partCost = (insertRow.quantity_used || 1) * (insertRow.cost_at_time || 0);
      const newTotalCost = (currentLogCost || 0) + partCost;

      const { error: updateError } = await supabase
        .from("maintenance_logs").update({ cost: newTotalCost }).eq("id", insertRow.maintenance_log_id);

      if (updateError) throw updateError;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_parts", variables.maintenance_log_id] });
      queryClient.invalidateQueries({ queryKey: ["parts_inventory"] });
      queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] });
    },
    onError: (err: Error) => notifyError({ title: "Error al agregar refacción", error: err }),
  });
}
