import { useQuery } from "@tanstack/react-query";
import type {
  CustomerSummary,
  CustomerSummaryBooking,
  CustomerSummaryInvoice,
} from "@/lib/domain/customerTypes";
import { callRpc } from "@/lib/rpc";

// Re-export para compatibilidad con consumidores existentes. La fuente de
// verdad de estos tipos vive en `@/lib/domain/customerTypes`.
export type { CustomerSummary, CustomerSummaryBooking, CustomerSummaryInvoice };


export function useCustomerSummary(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer_summary", customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: () =>
      callRpc<CustomerSummary>("get_customer_summary", { p_customer_id: customerId }),
  });
}
