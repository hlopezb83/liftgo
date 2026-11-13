import { useQuery } from "@tanstack/react-query";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { partInventoryKeys } from "../lib/queryKeys";
import type { PartCatalog } from "./usePartsInventory";

export const ACTIVATION_CATALOG_PAGE_SIZE = 50;
export type ActivationCatalogPart = Pick<PartCatalog, "id" | "sku" | "name">;
type Options = { open: boolean; search: string; page: number; selectedId: string };

function catalogQuery(search: string, head = false) {
  let query = supabase.from("parts_catalog").select("id,sku,name", { count: "exact", head }).eq("is_active", true);
  if (search) {
    // A quoted literal regular expression keeps PostgREST separators and LIKE
    // wildcards (including *) from changing what the user searched for.
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = `"${literal.replace(/[\\"]/g, (character) => `\\${character}`)}"`;
    query = query.or(`sku.imatch.${pattern},name.imatch.${pattern}`);
  }
  return query;
}

async function fetchCatalogPage(search: string, page: number, signal: AbortSignal, recoverRange = true): Promise<{
  items: ActivationCatalogPart[]; totalCount: number; pageIndex: number;
}> {
  const { data, count, error } = await catalogQuery(search).order("sku").order("id")
    .range(page * ACTIVATION_CATALOG_PAGE_SIZE, (page + 1) * ACTIVATION_CATALOG_PAGE_SIZE - 1)
    .abortSignal(signal);
  if (error?.code === "PGRST103" && recoverRange && page > 0) {
    // An offset can disappear while the dialog is open. Recount successfully
    // before correcting it; permission/network errors must never become empty.
    const result = await catalogQuery(search, true).abortSignal(signal);
    if (result.error) throw result.error;
    if (result.count === null) throw error;
    const lastPage = Math.max(0, Math.ceil(result.count / ACTIVATION_CATALOG_PAGE_SIZE) - 1);
    if (lastPage >= page) throw error;
    return fetchCatalogPage(search, lastPage, signal, false);
  }
  if (error) throw error;
  if (count === null) throw new Error("No se pudo verificar el tamaño del catálogo.");
  return { items: data ?? [], totalCount: count, pageIndex: page };
}

export async function fetchActivationCatalogPage(
  organizationId: string, { search, page, selectedId }: Omit<Options, "open">, signal: AbortSignal,
) {
  let result = await fetchCatalogPage(search, page, signal);
  const pageIndex = Math.min(result.pageIndex, Math.max(0, Math.ceil(result.totalCount / ACTIVATION_CATALOG_PAGE_SIZE) - 1));
  if (pageIndex !== result.pageIndex) result = await fetchCatalogPage(search, pageIndex, signal);
  let selected: ActivationCatalogPart | null = result.items.find((part) => part.id === selectedId) ?? null;
  if (selectedId && !selected) {
    const { data, error } = await supabase.from("parts_catalog").select("id,sku,name")
      .eq("id", selectedId).eq("is_active", true).abortSignal(signal).maybeSingle();
    if (error) throw error;
    selected = data;
  }
  const ids = [...new Set([...result.items.map((part) => part.id), ...(selected ? [selected.id] : [])])];
  let enabledIds = new Set<string | null>();
  if (ids.length) {
    // At most one page plus the selected ID; never infer eligibility from a
    // truncated company-wide inventory. RLS and the activation RPC still apply.
    const { data, error } = await supabase.from("parts_inventory").select("catalog_part_id")
      .eq("organization_id", organizationId).eq("is_active", true).in("catalog_part_id", ids).abortSignal(signal);
    if (error) throw error;
    enabledIds = new Set((data ?? []).map((part) => part.catalog_part_id));
  }
  return {
    items: result.items.filter((part) => !enabledIds.has(part.id)),
    selected: selected && !enabledIds.has(selected.id) ? selected : null,
    totalCount: result.totalCount,
    pageIndex: result.pageIndex,
  };
}

export function useActivationCatalogPage(options: Options) {
  const organization = useOrganizationContext();
  const identity = useVerifiedIdentityScope();
  const organizationId = organization.status === "ready" && organization.memberType === "internal"
    ? organization.organizationId : undefined;
  const enabled = options.open && !!identity && !!organizationId;
  const query = useQuery({
    queryKey: partInventoryKeys.byFilter({ purpose: "activation-catalog", identity, organizationId,
      search: options.search, page: options.page, selectedId: options.selectedId }),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
    queryFn: ({ signal }) => {
      if (!identity || !organizationId) throw new Error("No se pudo verificar la empresa.");
      return fetchActivationCatalogPage(organizationId, options, signal);
    },
  });
  const isError = query.isError || (options.open && organization.status !== "loading" && !enabled);
  const isReady = enabled && query.isSuccess && !query.isFetching;
  return { ...query, data: isReady ? query.data : undefined, isReady, isError,
    isLoading: options.open && !isError && !isReady };
}
