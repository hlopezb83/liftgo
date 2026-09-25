import { useQueryClient } from "@tanstack/react-query";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo } from "@/lib/ui/appFeedback";
import { isPacPending } from "../../../lib/pacPending";
import { invoiceKeys, paymentKeys } from "../../../lib/queryKeys";

export function useStampPaymentComplement() {
  const queryClient = useQueryClient();
  return useEntityMutation({
    mutationFn: async (paymentId: string) => {
      return await invokeEdgeFunction("stamp-payment-complement", {
        body: { payment_id: paymentId },
      });
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    successMsg: "Complemento de Pago timbrado",
    errorTitle: "Error al timbrar REP",
    onError: (error) => {
      if (!isPacPending(error)) return;
      notifyInfo("Facturapi aceptó el REP. El UUID aparecerá cuando concluya el timbrado.");
      void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      return true;
    },
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
