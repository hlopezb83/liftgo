import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { notifyError } from "@/lib/ui/appFeedback";
import { addMaintenancePartQuantity, MaintenancePartUnconfirmedError } from "../lib/maintenancePartRpc";
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
    mutationFn: async ({ id, min_stock_level, unit_cost, location }: Pick<PartInventory, "id" | "min_stock_level" | "unit_cost" | "location">) =>
      callRpc<PartInventory>("update_part_inventory_metadata", {
        p_part_id: id, p_min_stock_level: min_stock_level,
        p_unit_cost: unit_cost, p_location: location,
      }),
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al actualizar refacción",
  });
}

export function useAdjustPartStock() {
  return useEntityMutation({
    mutationFn: async ({ id, expectedQuantity, newQuantity, reason }: {
      id: string; expectedQuantity: number; newQuantity: number; reason: string;
    }) => callRpc<PartInventory>("adjust_part_stock", {
      p_part_id: id, p_expected_stock_quantity: expectedQuantity,
      p_new_stock_quantity: newQuantity, p_reason: reason,
    }),
    invalidateKeys: [partInventoryKeys.all, ["part_stock_adjustments"]],
    errorTitle: "No se pudo ajustar el inventario",
    successMsg: "Existencias ajustadas",
  });
}

export function useDeletePart() {
  return useEntityMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("parts_inventory")
        .update({ is_active: false })
        .eq("id", id)
        .select("id");
      if (error) throw error;
      assertRowsAffected(data, "Desactivar refacción");
    },
    invalidateKeys: [partInventoryKeys.all],
    errorTitle: "Error al desactivar refacción",
  });
}

export function useAddMaintenancePart() {
  return useEntityMutation({
    mutationFn: addMaintenancePartQuantity,
    retry: false,
    invalidateKeys: [
      ["maintenance_parts"] as const,
      partInventoryKeys.all,
      ["maintenance_logs"] as const,
    ],
    errorTitle: "Error al agregar refacción",
    errorMessage: "Si no recibiste confirmación, recarga las refacciones utilizadas antes de volver a agregar unidades.",
    onError: (error) => {
      const code = (error as Error & { code?: string }).code;
      if (error instanceof MaintenancePartUnconfirmedError || code === "23514" || code === "42501") {
        notifyError({ title: "Error al agregar refacción", error, description: error.message, severity: "warning" });
        return true;
      }
    },
  });
}
