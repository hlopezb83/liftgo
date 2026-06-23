import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";

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
      if (status === "accepted") toast.success("Cancelación aceptada por el SAT");
      else if (status === "rejected") toast.error("Cancelación rechazada por el receptor");
      else if (status === "expired") toast.warning("Cancelación expirada");
      else toast.info(`Estado SAT: ${status}`);
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
    },
    onError: (err) => notifyError({ error: err, message: "Error al consultar estado SAT" }),
  });
}
