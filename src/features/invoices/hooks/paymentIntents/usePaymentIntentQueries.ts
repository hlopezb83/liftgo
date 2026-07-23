import { useQuery } from "@tanstack/react-query";
import { portalQueries } from "../../lib/queryKeys";

export function usePortalPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    ...portalQueries.paymentIntents.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}

export function useAdminPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    ...portalQueries.adminPaymentIntents.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}
