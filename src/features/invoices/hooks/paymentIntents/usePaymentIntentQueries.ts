import { useQuery } from "@tanstack/react-query";
import {
  adminPaymentIntentsQueries,
  paymentIntentsQueries,
} from "@/features/invoices/lib/paymentIntentsQueryKeys";

export function usePortalPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    ...paymentIntentsQueries.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}

export function useAdminPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    ...adminPaymentIntentsQueries.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}
