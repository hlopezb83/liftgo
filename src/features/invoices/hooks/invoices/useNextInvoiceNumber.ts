import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";

export function useNextInvoiceNumber(enabled = true) {
  return useQuery({
    queryKey: invoiceKeys.nextNumber(),
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("peek_next_invoice_number");
      if (error) throw error;
      return data as string;
    },
  });
}
