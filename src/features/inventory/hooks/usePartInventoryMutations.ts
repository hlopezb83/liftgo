import { supabase } from "@/integrations/supabase/client";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { partInventoryKeys } from "../lib/queryKeys";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { PartInventory } from "./usePartsInventory";

export function useCreatePart() {
  return useEntityMutation({
    mutationFn: async (part: TablesInsert<"parts_inventory">) => {
      const { data, error } = await supabase
        .from("parts_inventory").insert(part).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al crear refacción",
  });
}

export function useUpdatePart() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PartInventory>) => {
      const { data, error } = await supabase
        .from("parts_inventory").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al actualizar refacción",
  });
}

export function useDeletePart() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("parts_inventory").delete().eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al eliminar refacción",
  });
}

export function useAddMaintenancePart() {
  return useEntityMutation({
    mutationFn: async (row: TablesInsert<"maintenance_parts"> & { currentLogCost?: number }) => {
      const { currentLogCost, ...insertRow } = row;

      const { data, error } = await supabase
        .from("maintenance_parts").insert(insertRow).select().single();
      if (error) throw error;

      const partCost = (insertRow.quantity_used || 1) * (insertRow.cost_at_time || 0);
      const newTotalCost = (currentLogCost || 0) + partCost;

      const { data: logUpdated, error: updateError } = await supabase
        .from("maintenance_logs").update({ cost: newTotalCost }).eq("id", insertRow.maintenance_log_id).select("id");

      if (updateError) throw updateError;
      assertRowsAffected(logUpdated, "Actualizar costo de mantenimiento");
      return data;
    },
    invalidateKeys: [
      ["maintenance_parts"] as const,
      partInventoryKeys.all,
      ["maintenance_logs"] as const,
    ],
    errorTitle: "Error al agregar refacción",
  });
}
