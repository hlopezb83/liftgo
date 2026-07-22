import { useQuery } from "@tanstack/react-query";
import type {
  CustomerSummary,
  CustomerSummaryBooking,
  CustomerSummaryInvoice,
} from "@/features/customers/lib/customerTypes";
import { callRpc } from "@/lib/rpc";
import { customerKeys } from "../../lib/queryKeys";

// Re-export para compatibilidad con consumidores existentes. La fuente de
// verdad de estos tipos vive en `@/features/customers/lib/customerTypes`.
export type { CustomerSummary, CustomerSummaryBooking, CustomerSummaryInvoice };


export function useCustomerSummary(customerId: string | undefined) {
  return useQuery({
    queryKey: customerId ? customerKeys.summary(customerId) : customerKeys.details(),
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: () =>
      callRpc<CustomerSummary>("get_customer_summary", { p_customer_id: customerId }),
  });
}
