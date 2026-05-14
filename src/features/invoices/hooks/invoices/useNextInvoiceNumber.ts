import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useNextInvoiceNumber(enabled = true) {
  return useQuery({
    queryKey: ["invoices", "next-number"],
    enabled,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("next_invoice_number");
      if (error) throw error;
      return data as string;
    },
  });
}
