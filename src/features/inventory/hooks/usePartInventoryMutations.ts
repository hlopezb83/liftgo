import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { partInventoryKeys } from "../lib/queryKeys";
import type { PartInventory } from "./usePartsInventory";

export type ActivateCatalogPartInput = {
  catalogPartId: string;
  stockQuantity: number;
  minStockLevel: number;
  unitCost: number;
  location?: string | null;
};

export function useActivateCatalogPart() {
  return useEntityMutation({
    mutationFn: async (input: ActivateCatalogPartInput) => {
      const { data, error } = await supabase.rpc("activate_parts_catalog", {
        p_catalog_part_id: input.catalogPartId,
        p_stock_quantity: input.stockQuantity,
        p_min_stock_level: input.minStockLevel,
        p_unit_cost: input.unitCost,
        p_location: input.location || undefined,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al habilitar refacción",
  });
}

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
      const { error } = await supabase
        .from("parts_inventory")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al desactivar refacción",
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
