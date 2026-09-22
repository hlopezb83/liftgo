import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { maintenancePartKeys } from "../lib/queryKeys";

const sel = (s: string): string => s;

const PART_COLUMNS = sel("id, catalog_part_id, name, sku, category, stock_quantity, min_stock_level, unit_cost, location, is_active, created_at, updated_at");

export type PartInventory = Tables<"parts_inventory">;
export type PartCatalog = Tables<"parts_catalog">;

export const partsInventoryQueries = defineEntityQueries<"parts_inventory", PartInventory[], never>(
  "parts_inventory",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("parts_inventory")
        .select(PART_COLUMNS)
        .eq("is_active", true)
        .order("name")
        .limit(LIST_FETCH_LIMIT)
        .returns<PartInventory[]>();
      if (error) throw error;
      return data;
    },
  },
);

export function usePartsInventory() {
  return useQuery(partsInventoryQueries.list());
}

export function usePartsCatalog() {
  return useQuery({
    queryKey: ["parts_catalog", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_catalog")
        .select("*")
        .eq("is_active", true)
        .order("sku")
        .limit(LIST_FETCH_LIMIT)
        .returns<PartCatalog[]>();
      if (error) throw error;
      return data;
    },
  });
}

export function useMaintenanceParts(maintenanceLogId?: string) {
  return useQuery({
    queryKey: maintenancePartKeys.byLog(maintenanceLogId ?? ""),
    enabled: !!maintenanceLogId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_parts")
        .select("*, parts_inventory(name, sku, category)")
        .eq("maintenance_log_id", maintenanceLogId ?? "")
        .order("created_at")
        .limit(LIST_FETCH_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export {
  useCreatePart,
  useActivateCatalogPart,
  useUpdatePart,
  useDeletePart,
  useAddMaintenancePart,
} from "./usePartInventoryMutations";
