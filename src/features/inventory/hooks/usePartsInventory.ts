import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PartInventory = Tables<"parts_inventory">;

export function usePartsInventory() {
  return useQuery({
    queryKey: ["parts_inventory"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parts_inventory").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useMaintenanceParts(maintenanceLogId?: string) {
  return useQuery({
    queryKey: ["maintenance_parts", maintenanceLogId],
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
