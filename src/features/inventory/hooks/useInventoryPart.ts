import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { inventoryItemSchema } from "../lib/inventoryPageRpc";
import { partInventoryKeys } from "../lib/queryKeys";

/** Keep an opened inspector independent of the current list page/filter. */
export function useInventoryPart(id: string | null) {
  const organization = useOrganizationContext();
  const organizationId = organization.status === "ready" ? organization.organizationId : undefined;
  return useQuery({
    queryKey: [...partInventoryKeys.detail(id ?? ""), organizationId],
    enabled: !!id && !!organizationId,
    queryFn: async ({ signal }) => {
      if (!id || !organizationId) throw new Error("No se pudo verificar la refacción.");
      const { data, error } = await supabase.from("parts_inventory")
        .select("id, organization_id, catalog_part_id, name, sku, category, stock_quantity, min_stock_level, unit_cost, location, is_active, created_at, updated_at")
        .eq("organization_id", organizationId).eq("id", id).eq("is_active", true)
        .abortSignal(signal).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const part = inventoryItemSchema.parse(data);
      if (part.id !== id || part.organization_id !== organizationId) throw new Error("Refacción fuera de la empresa seleccionada.");
      return part;
    },
  });
}
