import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";

export function useRefreshCancellationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke("refresh-cancellation-status", {
        body: { invoice_id: invoiceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { cancellation_status: string };
    },
    onSuccess: (data, invoiceId) => {
      const status = data?.cancellation_status;
      if (status === "accepted") toast.success("Cancelación aceptada por el SAT");
      else if (status === "rejected") toast.error("Cancelación rechazada por el receptor");
      else if (status === "expired") toast.warning("Cancelación expirada");
      else toast.info(`Estado SAT: ${status}`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onError: (err) => notifyError({ error: err, message: "Error al consultar estado SAT" }),
  });
}
