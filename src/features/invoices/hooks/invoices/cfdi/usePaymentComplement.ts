import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

import { invoiceKeys, paymentKeys } from "../../../lib/queryKeys";
export function useStampPaymentComplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      return await invokeEdgeFunction("stamp-payment-complement", {
        body: { payment_id: paymentId },
      });
    },
    onSuccess: (_d, _vars) => {
      notifySuccess("Complemento de Pago timbrado");
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err) => notifyError({ error: err, message: "Error al timbrar REP" }),
  });
}

export function useCancelPaymentComplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, motive }: { paymentId: string; motive: string }) => {
      return await invokeEdgeFunction("cancel-payment-complement", {
        body: { payment_id: paymentId, motive },
      });
    },
    onSuccess: () => {
      notifySuccess("REP cancelado");
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err) => notifyError({ error: err, message: "Error al cancelar REP" }),
  });
}
