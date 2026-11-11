import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVerifiedOrganizationId } from "@/contexts/OrganizationContext";
import { bookingKeys } from "@/features/bookings";
import { supabase } from "@/integrations/supabase/client";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { e2eVisibilityFilter, isE2eDataVisible } from "@/lib/supabase/constants";
import { readInvoiceBookingCandidatePage } from "../../lib/invoiceBookingReadRpc";
import { readAllBillingPages } from "./useBookingBillingEvidence";

const SELECTOR_PAGE_SIZE = 50;

interface CandidatePageFilters {
  search: string;
  page: number;
  customerId: string | null;
  linkedOnly: boolean;
}

/** Complete siblings only for selected quotes that require discount allocation. */
async function fetchQuotedBookingSiblings(organizationId: string, visibility: string, quoteIds: string[], signal: AbortSignal) {
  const query = (ids: string[]) => supabase.from("bookings")
    .select("id,forklift_id,quote_id,organization_id,currency,status,start_date,end_date,recurring_billing,daily_rate,weekly_rate,monthly_rate,quote_rental_line_index")
    .eq("organization_id", organizationId).or(visibility).in("quote_id", ids).in("status", ["confirmed", "completed"]);
  type Row = NonNullable<Awaited<ReturnType<typeof query>>["data"]>[number];
  const rows: Row[] = [];
  for (let index = 0; index < quoteIds.length; index += SELECTOR_PAGE_SIZE) {
    const ids = quoteIds.slice(index, index + SELECTOR_PAGE_SIZE);
    rows.push(...await readAllBillingPages<Row>((from, to) => query(ids).order("id").range(from, to).abortSignal(signal), signal));
  }
  return rows;
}

export function useInvoiceBookingCandidates(linkedIds: readonly string[], filters: CandidatePageFilters) {
  const organizationId = useVerifiedOrganizationId();
  const identity = useVerifiedIdentityScope();
  const visibility = e2eVisibilityFilter();
  const includeE2e = isE2eDataVisible();
  const queryClient = useQueryClient();
  const ids = [...new Set(linkedIds)].sort();
  const result = useQuery<Awaited<ReturnType<typeof readInvoiceBookingCandidatePage>>>({
    queryKey: bookingKeys.byFilter({ purpose: "invoice-candidates", identity, visibility, linkedIds: ids, ...filters }),
    enabled: !!identity && !!organizationId,
    placeholderData: (previous, previousQuery) => {
      const previousScope = previousQuery?.queryKey[2];
      return previousScope && typeof previousScope === "object"
        && "identity" in previousScope && previousScope.identity === identity
        && "visibility" in previousScope && previousScope.visibility === visibility ? previous : undefined;
    },
    queryFn: async ({ signal }) => {
      if (!organizationId || !identity) throw new Error("Empresa no verificada");
      if (filters.linkedOnly && ids.length === 0) return { bookings: [], hasMore: false, pageIndex: filters.page };
      return readInvoiceBookingCandidatePage({
        p_expected_organization_id: organizationId,
        p_search: filters.search,
        p_customer_id: filters.customerId,
        p_page: filters.page,
        p_page_size: filters.linkedOnly ? 0 : SELECTOR_PAGE_SIZE,
        p_linked_ids: ids,
        p_include_e2e: includeE2e,
      }, signal);
    },
    staleTime: 60_000,
  });
  const loadQuotedBookings = (quoteIds: string[]) => {
    if (!organizationId || !identity) return Promise.reject(new Error("Empresa no verificada"));
    const sorted = [...new Set(quoteIds)].sort();
    return queryClient.fetchQuery({
      queryKey: bookingKeys.byFilter({ purpose: "invoice-quote-siblings", identity, visibility, quoteIds: sorted }),
      queryFn: ({ signal }) => fetchQuotedBookingSiblings(organizationId, visibility, sorted, signal),
      staleTime: 60_000,
    });
  };
  return { ...result, data: result.data?.bookings, hasMore: result.data?.hasMore ?? false, loadQuotedBookings };
}
