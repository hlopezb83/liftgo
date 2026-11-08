import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { EXCLUDE_E2E_FILTER } from "@/lib/supabase/constants";
import type { Quote } from "@/types/rental";
import { crmQuoteSearchFilter } from "../../lib/crmQuoteSearchFilter";

export type CrmQuote = Pick<Quote, "id" | "quote_number" | "customer_name" | "total" | "currency" | "status"> & { tipo_cambio: number | null };
export type CrmQuoteNumber = Pick<Quote, "id" | "quote_number">;
const COLUMNS = "id, quote_number, customer_name, total, currency, tipo_cambio, status";
export const CRM_QUOTE_PAGE_SIZE = 50;
export const CRM_QUOTE_ID_BATCH_SIZE = 100;
const keys = createEntityKeys("quotes");

/** Identity is verified by the existing server-backed organization context, never by form input. */
function useCrmQuoteScope() {
  return { identity: useVerifiedIdentityScope(), organizationId: useVerifiedOrganizationId() };
}

export function useCrmQuoteOptions(search: string, enabled = true) {
  const { identity, organizationId } = useCrmQuoteScope();
  const term = search.trim().slice(0, 200);
  return useInfiniteQuery({
    queryKey: [...keys.lists(), "crm-options", identity, term],
    enabled: enabled && !!identity && !!organizationId,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam, signal }) => {
      if (!identity || !organizationId) throw new Error("No se pudo verificar la empresa.");
      let query = supabase.from("quotes").select(COLUMNS)
        .eq("organization_id", organizationId).or(EXCLUDE_E2E_FILTER);
      if (term) query = query.or(crmQuoteSearchFilter(term));
      const { data, error } = await query
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(pageParam, pageParam + CRM_QUOTE_PAGE_SIZE - 1)
        .abortSignal(signal).returns<CrmQuote[]>();
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (lastPage, pages) => lastPage.length === CRM_QUOTE_PAGE_SIZE
      ? pages.length * CRM_QUOTE_PAGE_SIZE : undefined,
  });
}

/** Resolve the stored relation independently of the selector's page or search. */
export function useCrmQuote(id: string | null, enabled = true) {
  const { identity, organizationId } = useCrmQuoteScope();
  return useQuery({
    // Keep relation readers under lists so existing quote mutations invalidate them too.
    queryKey: [...keys.lists(), "crm-linked", identity, id],
    enabled: enabled && !!id && !!identity && !!organizationId,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!identity || !organizationId || !id) throw new Error("No se pudo verificar la cotización.");
      const { data, error } = await supabase.from("quotes").select(COLUMNS)
        .eq("organization_id", organizationId).eq("id", id).or(EXCLUDE_E2E_FILTER)
        .abortSignal(signal).maybeSingle().returns<CrmQuote | null>();
      if (error) throw error;
      return data;
    },
  });
}

/** Fetch only references used by CRM, with bounded IN requests and no global list cap. */
export function useCrmQuoteNumbers(ids: readonly string[]) {
  const { identity, organizationId } = useCrmQuoteScope();
  const uniqueIds = [...new Set(ids)].sort();
  return useQuery({
    queryKey: [...keys.lists(), "crm-numbers", identity, uniqueIds],
    enabled: uniqueIds.length > 0 && !!identity && !!organizationId,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!identity || !organizationId) throw new Error("No se pudo verificar la empresa.");
      const rows: CrmQuoteNumber[] = [];
      for (let offset = 0; offset < uniqueIds.length; offset += CRM_QUOTE_ID_BATCH_SIZE) {
        signal.throwIfAborted();
        const { data, error } = await supabase.from("quotes").select("id, quote_number")
          .eq("organization_id", organizationId).or(EXCLUDE_E2E_FILTER)
          .in("id", uniqueIds.slice(offset, offset + CRM_QUOTE_ID_BATCH_SIZE))
          .abortSignal(signal).returns<CrmQuoteNumber[]>();
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      return rows;
    },
  });
}
