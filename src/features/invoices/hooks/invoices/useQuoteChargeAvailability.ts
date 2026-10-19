import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";
import { parseQuoteChargeAvailability } from "../../lib/quoteChargeAvailability";

export function quoteChargeAvailabilityQuery(quoteIds: string[], currentInvoiceId?: string) {
  const ids = [...new Set(quoteIds)].sort();
  return queryOptions({
    queryKey: [...invoiceKeys.all, "quote-charge-availability", ids, currentInvoiceId ?? null],
    enabled: ids.length > 0,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_quote_charge_availability", {
        p_quote_ids: ids,
        p_exclude_invoice_id: currentInvoiceId ?? undefined,
      });
      if (error) throw error;
      return parseQuoteChargeAvailability(data, ids);
    },
  });
}

export function useQuoteChargeAvailability(quoteIds: string[], currentInvoiceId?: string) {
  const queryClient = useQueryClient();
  const query = useQuery(quoteChargeAvailabilityQuery(quoteIds, currentInvoiceId));
  return {
    ...query,
    loadForQuotes: (ids: string[]) => queryClient.fetchQuery(quoteChargeAvailabilityQuery(ids, currentInvoiceId)),
  };
}
