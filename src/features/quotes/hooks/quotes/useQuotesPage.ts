import { queryOptions, useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { callQuotesPageRpc, parseQuotesPage } from "../../lib/quotesPageRpc";
import { quoteKeys } from "./useQuotes";
import type { PaginationState, SortingState } from "@tanstack/react-table";

export interface QuotesPageFilters extends PaginationState {
  search: string;
  status: string;
  sorting: SortingState;
}

const SORT_COLUMNS = new Set(["quote_number", "customer_name", "total", "status", "valid_until"]);
const STATUSES = new Set(["draft", "sent", "accepted", "converted", "rejected", "expired", "cancelled"]);

function normalizeFilters(filters: QuotesPageFilters): QuotesPageFilters {
  const seenSortIds = new Set<string>();
  const sorting = filters.sorting.filter(({ id }) => {
    if (!SORT_COLUMNS.has(id) || seenSortIds.has(id)) return false;
    seenSortIds.add(id);
    return true;
  }).slice(0, 5);
  return {
    search: filters.search.trim(),
    status: STATUSES.has(filters.status) ? filters.status : "all",
    pageIndex: Number.isSafeInteger(filters.pageIndex) ? Math.min(100000, Math.max(0, filters.pageIndex)) : 0,
    pageSize: Number.isSafeInteger(filters.pageSize) ? Math.min(100, Math.max(1, filters.pageSize)) : 25,
    sorting,
  };
}

export function quotesPageQueryOptions(organizationId: string | undefined, input: QuotesPageFilters) {
  const filters = normalizeFilters(input);
  return queryOptions({
    queryKey: quoteKeys.byFilter({ scope: "page", organizationId, ...filters }),
    enabled: !!organizationId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!organizationId) throw new Error("No se pudo verificar la empresa.");
      const { data: auth, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!auth.session) throw Object.assign(new Error("Tu sesión expiró. Inicia sesión para consultar las cotizaciones."), { status: 401 });
      const { data, error } = await callQuotesPageRpc({
        p_expected_organization_id: organizationId,
        p_search: filters.search || null,
        p_status: filters.status,
        p_page: filters.pageIndex,
        p_page_size: filters.pageSize,
        p_sort: filters.sorting,
      }, signal);
      if (error) throw error;
      return parseQuotesPage(data, filters.pageIndex, filters.pageSize);
    },
  });
}

/** Dedicated page contract; legacy useQuotes/CRM/detail consumers remain unchanged. */
export function useQuotesPage(filters: QuotesPageFilters) {
  const organization = useOrganizationContext();
  const query = useQuery(quotesPageQueryOptions(
    organization.status === "ready" ? organization.organizationId : undefined,
    filters,
  ));
  return {
    ...query,
    isLoading: organization.status === "loading" || query.isLoading,
    isError: (organization.status !== "ready" && organization.status !== "loading") || query.isError,
  };
}
