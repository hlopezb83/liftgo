import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";

const nextNumberQuery = (enabled = true) =>
  queryOptions({
    queryKey: invoiceKeys.nextNumber(),
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("peek_next_draft_invoice_number");
      if (error) throw error;
      return data as string;
    },
  });

export function useNextInvoiceNumber(enabled = true) {
  return useQuery(nextNumberQuery(enabled));
}
