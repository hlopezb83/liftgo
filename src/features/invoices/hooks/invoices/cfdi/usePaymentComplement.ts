import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";

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
      toast.success("Complemento de Pago timbrado");
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
      toast.success("REP cancelado");
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err) => notifyError({ error: err, message: "Error al cancelar REP" }),
  });
}
