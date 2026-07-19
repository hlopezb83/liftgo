import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { partInventoryKeys } from "../lib/queryKeys";
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
      // BL-28/29 (v7.93.0): el stock de parts_inventory y el `cost` de
      // maintenance_logs los recalculan triggers en el servidor
      // (`trg_maintenance_parts_adjust_stock` y `trg_maintenance_parts_recalc_cost`).
      // Aquí sólo insertamos la fila.
      const { currentLogCost: _ignored, ...insertRow } = row;
      const { data, error } = await supabase
        .from("maintenance_parts").insert(insertRow).select().single();
      if (error) throw error;
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

