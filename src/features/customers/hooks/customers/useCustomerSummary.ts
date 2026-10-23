import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";
import { customerKeys } from "../../lib/queryKeys";
import type { CustomerSummary } from "../../lib/customerTypes";

// Re-export para compatibilidad con consumidores existentes. La fuente de
// verdad de estos tipos vive en `@/features/customers/lib/customerTypes`.
export type { CustomerSummary };

export function useCustomerSummary(customerId: string | undefined) {
  return useQuery({
    queryKey: customerId ? customerKeys.summary(customerId) : customerKeys.details(),
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: () =>
      callRpc<CustomerSummary>("get_customer_summary", { p_customer_id: customerId }),
  });
}
