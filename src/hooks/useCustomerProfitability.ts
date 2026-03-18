import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerProfitability {
  revenue: number;
  maintenance_cost: number;
  gross_margin: number;
  margin_percent: number;
}

export function useCustomerProfitability(customerId?: string) {
  return useQuery({
    queryKey: ["customer_profitability", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_profitability", {
        p_customer_id: customerId!,
      });
      if (error) throw error;
      return data as unknown as CustomerProfitability;
    },
  });
}
