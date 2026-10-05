import { useQueryClient } from "@tanstack/react-query";
import { satStatusLabel } from "@/features/feedback";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";
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
    successMsg: "Complemento de pago timbrado",
    errorTitle: "No se pudo timbrar el complemento de pago",
    onError: (error) => {
      if (!isPacPending(error)) return;
      notifyInfo("Solicitud de timbrado recibida. El complemento sigue pendiente; consulta su estado para confirmar el resultado.");
      void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      return true;
    },
  });
}

export function useCancelPaymentComplement() {
  return useEntityMutation({
    mutationFn: async ({ paymentId, motive }: { paymentId: string; motive: string }) => {
      return await invokeEdgeFunction<{ cancellation_status?: string }>("cancel-payment-complement", {
        body: { payment_id: paymentId, motive },
      });
    },
    invalidateKeys: [paymentKeys.all, invoiceKeys.all],
    errorTitle: "No se pudo cancelar el complemento de pago",
    onSuccess: (data) => {
      if (data?.cancellation_status === "accepted") {
        notifySuccess("Complemento de pago cancelado");
      } else {
        notifyInfo(satStatusLabel(data?.cancellation_status));
      }
    },
  });
}
