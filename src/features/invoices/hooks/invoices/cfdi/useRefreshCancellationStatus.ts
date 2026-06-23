import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
import { satStatusLabel } from "@/lib/domain/feedbackMessages";

import { invoiceKeys } from "../../../lib/queryKeys";
export function useRefreshCancellationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      return await invokeEdgeFunction<{ cancellation_status: string }>(
        "refresh-cancellation-status",
        { body: { invoice_id: invoiceId } },
      );
    },
    onSuccess: (data, invoiceId) => {
      const status = data?.cancellation_status;
      if (status === "accepted") notifySuccess("Cancelación aceptada por el SAT");
      else if (status === "rejected")
        notifyWarning({ title: "Cancelación rechazada", description: "El receptor no aceptó la cancelación." });
      else if (status === "expired") notifyWarning("Cancelación expirada");
      else notifyInfo(satStatusLabel(status));
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
    },
    onError: (err) => notifyError({ error: err, message: "Error al consultar estado SAT" }),
  });
}
