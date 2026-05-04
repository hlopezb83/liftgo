import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";

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
    queryFn: () =>
      callRpc<CustomerProfitability>("get_customer_profitability", { p_customer_id: customerId }),
  });
}
