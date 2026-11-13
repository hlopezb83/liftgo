import { queryOptions, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useHasModuleAccess } from "@/features/users";
import { callDeliveriesPageRpc, parseDeliveriesPage, type DeliveriesPageRpcArgs } from "../lib/deliveriesPageRpc";
import { deliveryKeys } from "./useDeliveries";
import type { PaginationState, SortingState } from "@tanstack/react-table";

export interface DeliveriesFilters extends PaginationState {
  search: string;
  type: string;
  status: string;
  history: string;
  sorting: SortingState;
}
const SORT_COLUMNS = new Set(["delivery_number", "type", "scheduled_date", "forklift_name", "driver_name", "status"]);

export function deliveriesPageOptions(organizationId: string | undefined, userId: string | undefined, input: DeliveriesFilters, allowed: boolean) {
  const seen = new Set<string>();
  const args: DeliveriesPageRpcArgs = {
    p_expected_organization_id: organizationId ?? "",
    p_search: input.search.trim() || null,
    p_type: ["delivery", "pickup", "return"].includes(input.type) ? input.type : "all",
    p_status: ["scheduled", "in_transit", "completed", "cancelled"].includes(input.status) ? input.status : "all",
    p_history: ["history", "reconciled"].includes(input.history) ? input.history : "all",
    p_page: Number.isSafeInteger(input.pageIndex) ? Math.min(100000, Math.max(0, input.pageIndex)) : 0,
    p_page_size: Number.isSafeInteger(input.pageSize) ? Math.min(100, Math.max(1, input.pageSize)) : 25,
    p_sort: input.sorting.filter(({ id }) => {
      if (!SORT_COLUMNS.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    }).slice(0, 5),
  };
  return queryOptions({
    // Existing delivery mutations invalidate both these pages and dashboardStats.
    queryKey: deliveryKeys.byFilter({ purpose: "general-page", organizationId, userId, allowed, ...args }),
    enabled: allowed && !!organizationId && !!userId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!allowed || !organizationId || !userId) throw new Error("No se pudo verificar tu acceso a los transportes.");
      const { data, error } = await callDeliveriesPageRpc(args, signal);
      if (error) throw error;
      return parseDeliveriesPage(data, args);
    },
  });
}

export function useDeliveriesPage(filters: DeliveriesFilters) {
  const { user } = useAuth();
  const organization = useOrganizationContext();
  const allowed = useHasModuleAccess("Entregas", "read");
  const organizationId = organization.status === "ready" && organization.memberType === "internal"
    ? organization.organizationId : undefined;
  const query = useQuery(deliveriesPageOptions(organizationId, user?.id, filters, allowed));
  return {
    ...query,
    data: allowed && organizationId && user?.id ? query.data : undefined,
    isLoading: organization.status === "loading" || query.isLoading,
    isError: (organization.status !== "loading" && (!organizationId || !allowed || !user?.id)) || query.isError,
  };
}
