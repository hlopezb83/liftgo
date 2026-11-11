import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { getAccessLevel, hasFinancialAccess, useRolePermissions, useUserRole } from "@/features/users";
import { EMPTY_SEARCH_RESULTS, normalizeEntitySearchTerm, searchEntities, type EntitySearchPermissions } from "../lib/globalSearchRpc";
export type { EntityResults, EntitySearchPermissions } from "../lib/globalSearchRpc";

function useSearchPermissions() {
  const roleQuery = useUserRole();
  const permissionsQuery = useRolePermissions();
  const role = roleQuery.data ?? undefined;
  const blocked = [roleQuery.isLoading, permissionsQuery.isLoading, roleQuery.isError, permissionsQuery.isError].some(Boolean);
  const canRead = (module: string) => !blocked && getAccessLevel(permissionsQuery.data, role, module) !== "none";
  const permissions: EntitySearchPermissions = {
    invoices: canRead("Facturas") && hasFinancialAccess(role),
    quotes: canRead("Cotizaciones"), customers: canRead("Clientes"), bookings: canRead("Reservas"),
    deliveries: canRead("Entregas"), returns: canRead("Entregas"),
  };
  const loading = [roleQuery.isLoading, permissionsQuery.isLoading,
    roleQuery.isError && roleQuery.isFetching, permissionsQuery.isError && permissionsQuery.isFetching].some(Boolean);
  const retryAccess = () => Promise.all([
    ...(roleQuery.isError ? [roleQuery.refetch()] : []),
    ...(permissionsQuery.isError ? [permissionsQuery.refetch()] : []),
  ]);
  return { role, permissions, loading, isAccessError: roleQuery.isError || permissionsQuery.isError, retryAccess };
}

function hasSearchScope(authLoading: boolean, userId: string | undefined, organizationId: string | undefined, permissions: EntitySearchPermissions) {
  return !authLoading && !!userId && !!organizationId && Object.values(permissions).some(Boolean);
}

const SEARCH_STALE_MS = 30_000;

function hasFreshSearchResult(queryClient: QueryClient, queryKey: QueryKey): boolean {
  const cached = queryClient.getQueryCache().find({ queryKey, exact: true });
  return cached?.state.status === "success" && !cached.isStaleByTime(SEARCH_STALE_MS);
}

export function useEntitySearch(query: string, enabled: boolean, debouncedQuery = query) {
  const org = useOrganizationContext();
  const { user, isLoading: authLoading } = useAuth();
  const { role, permissions, loading: permissionsLoading, isAccessError, retryAccess } = useSearchPermissions();
  const userId = user?.id;
  const organizationId = org.status === "ready" ? org.organizationId : undefined;
  const canSearchEntities = hasSearchScope(authLoading, userId, organizationId, permissions);
  const queryClient = useQueryClient();
  // Role matters even when the module mask matches: RLS may differ by role.
  const searchKey = (term: string) => ["global-search", organizationId ?? "unresolved", userId ?? "anonymous", role ?? "unresolved", permissions, term];
  const currentTerm = normalizeEntitySearchTerm(query);
  const canReuse = enabled && canSearchEntities && currentTerm.length >= 2
    && hasFreshSearchResult(queryClient, searchKey(currentTerm));
  const activeQuery = canReuse || currentTerm.length < 2 ? query : debouncedQuery;
  const normalizedQuery = normalizeEntitySearchTerm(activeQuery);
  const searchEnabled = enabled && canSearchEntities && normalizedQuery.length >= 2 && normalizedQuery === currentTerm;
  const resolving = [authLoading, org.status === "loading", permissionsLoading].some(Boolean);
  const result = useQuery({
    queryKey: searchKey(searchEnabled ? normalizedQuery : ""),
    queryFn: ({ signal }) => searchEnabled ? searchEntities(normalizedQuery, organizationId, permissions, signal) : Promise.resolve(EMPTY_SEARCH_RESULTS),
    enabled: searchEnabled,
    staleTime: SEARCH_STALE_MS,
  });
  return {
    ...result,
    // Disabled queries may retain cached data while auth is resolving.
    data: canSearchEntities ? result.data : undefined,
    activeQuery,
    canSearchEntities,
    isResolvingAccess: enabled && resolving,
    isAccessError,
    // Only retry failed access sources, never the protected entity search.
    retryAccess: () => !authLoading && userId ? retryAccess() : Promise.resolve([]),
  };
}
