import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useInventoryPart, inventoryPageQueryOptions } from "@/features/inventory";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";

export const MAINTENANCE_PART_PAGE_SIZE = 25;

/** Page and selection are separate reads: searching never loses the selected SKU. */
export function useMaintenancePartOptions(options: { open: boolean; search: string; page: number; selectedId: string | null }) {
  const organization = useOrganizationContext();
  const identity = useVerifiedIdentityScope();
  const organizationId = organization.status === "ready" && organization.memberType === "internal"
    ? organization.organizationId : undefined;
  const queryOptions = inventoryPageQueryOptions(organizationId, {
    search: options.search, category: "all", pageIndex: options.page, pageSize: MAINTENANCE_PART_PAGE_SIZE,
    sorting: [], maintenanceStockOnly: true,
  }, identity);
  const pageQuery = useQuery({
    ...queryOptions,
    enabled: options.open && !!identity && !!organizationId, staleTime: 0, retry: false,
  });
  const selectedQuery = useInventoryPart(options.selectedId);
  const contextError = organization.status !== "loading" && (!identity || !organizationId);
  return { pageQuery, selectedQuery, contextError };
}
