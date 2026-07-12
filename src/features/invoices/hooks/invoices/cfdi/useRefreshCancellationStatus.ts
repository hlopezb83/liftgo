import { satStatusLabel } from "@/lib/domain/feedbackMessages";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { invoiceKeys } from "../../../lib/queryKeys";

export function useRefreshCancellationStatus() {
  return useEntityMutation({
    mutationFn: async (invoiceId: string) => {
      return await invokeEdgeFunction<{ cancellation_status: string }>(
        "refresh-cancellation-status",
        { body: { invoice_id: invoiceId } },
      );
    },
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_data, invoiceId) => [invoiceKeys.detail(invoiceId)],
    errorTitle: "Error al consultar estado SAT",
    onSuccess: (data) => {
      const status = data?.cancellation_status;
      if (status === "accepted") notifySuccess("Cancelación aceptada por el SAT");
      else if (status === "rejected")
        notifyWarning({ title: "Cancelación rechazada", description: "El receptor no aceptó la cancelación." });
      else if (status === "expired") notifyWarning("Cancelación expirada");
      else notifyInfo(satStatusLabel(status));
    },
  });
}
