import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { maintenancePartKeys } from "../lib/queryKeys";

const sel = (s: string): string => s;

const PART_COLUMNS = sel("id, name, sku, category, stock_quantity, min_stock_level, unit_cost, location, created_at, updated_at");

export type PartInventory = Tables<"parts_inventory">;

export const partsInventoryQueries = defineEntityQueries<"parts_inventory", PartInventory[], never>(
  "parts_inventory",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("parts_inventory")
        .select(PART_COLUMNS)
        .order("name")
        .returns<PartInventory[]>();
      if (error) throw error;
      return data;
    },
  },
);

export function usePartsInventory() {
  return useQuery(partsInventoryQueries.list());
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
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export {
  useCreatePart,
  useUpdatePart,
  useDeletePart,
  useAddMaintenancePart,
} from "./usePartInventoryMutations";
