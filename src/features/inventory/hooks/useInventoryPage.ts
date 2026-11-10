import { queryOptions, useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { callInventoryPageRpc, parseInventoryPage } from "../lib/inventoryPageRpc";
import { partInventoryKeys } from "../lib/queryKeys";
import type { PaginationState, SortingState } from "@tanstack/react-table";

export interface InventoryPageFilters extends PaginationState {
  search: string;
  category: string;
  sorting: SortingState;
}

const SORT_COLUMNS = new Set(["sku", "name", "category", "unit_cost", "stock_quantity"]);


function normalizeFilters(filters: InventoryPageFilters): InventoryPageFilters {
  const seenSortIds = new Set<string>();
  const sorting = filters.sorting.filter(({ id }) => {
    if (!SORT_COLUMNS.has(id) || seenSortIds.has(id)) return false;
    seenSortIds.add(id);
    return true;
  }).slice(0, 5);
  return {
    search: filters.search.trim(),
    category: filters.category || "all",
    pageIndex: Number.isSafeInteger(filters.pageIndex) ? Math.min(100000, Math.max(0, filters.pageIndex)) : 0,
    pageSize: Number.isSafeInteger(filters.pageSize) ? Math.min(100, Math.max(1, filters.pageSize)) : 25,
    sorting,
  };
}

export function inventoryPageQueryOptions(organizationId: string | undefined, input: InventoryPageFilters) {
  const filters = normalizeFilters(input);
  return queryOptions({
    queryKey: partInventoryKeys.byFilter({ scope: "page", organizationId, ...filters }),
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!organizationId) throw new Error("No se pudo verificar la empresa.");
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!auth.session) throw Object.assign(new Error("Tu sesión expiró. Inicia sesión para consultar las refacciones."), { status: 401 });
      const { data, error } = await callInventoryPageRpc({
        p_expected_organization_id: organizationId,
        p_search: filters.search || null,
        p_category: filters.category,
        p_page: filters.pageIndex,
        p_page_size: filters.pageSize,
        p_sort: filters.sorting,
      }, signal);
      if (error) throw error;
      return parseInventoryPage(data, filters.pageIndex, filters.pageSize, organizationId);
    },
  });
}

/** Dedicated list contract; maintenance/catalog consumers remain unchanged. */
export function useInventoryPage(filters: InventoryPageFilters) {
  const organization = useOrganizationContext();
  const query = useQuery(inventoryPageQueryOptions(
    organization.status === "ready" ? organization.organizationId : undefined,
    filters,
  ));
  return {
    ...query,
    isLoading: organization.status === "loading" || query.isLoading,
    isError: (organization.status !== "ready" && organization.status !== "loading") || query.isError,
  };
}
