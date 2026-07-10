import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

import { invoiceKeys, paymentKeys } from "../../../lib/queryKeys";

export function useStampPaymentComplement() {
  return useEntityMutation({
    mutationFn: async (paymentId: string) => {
      return await invokeEdgeFunction("stamp-payment-complement", {
        body: { payment_id: paymentId },
      });
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    successMsg: "Complemento de Pago timbrado",
    errorTitle: "Error al timbrar REP",
  });
}

export function useCancelPaymentComplement() {
  return useEntityMutation({
    mutationFn: async ({ paymentId, motive }: { paymentId: string; motive: string }) => {
      return await invokeEdgeFunction("cancel-payment-complement", {
        body: { payment_id: paymentId, motive },
      });
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    successMsg: "REP cancelado",
    errorTitle: "Error al cancelar REP",
  });
}
