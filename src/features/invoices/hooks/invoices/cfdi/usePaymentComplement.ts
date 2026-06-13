import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";
import { toast } from "sonner";

import { invoiceKeys, paymentKeys } from "../../../lib/queryKeys";
export function useStampPaymentComplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase.functions.invoke("stamp-payment-complement", {
        body: { payment_id: paymentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
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
      const { data, error } = await supabase.functions.invoke("cancel-payment-complement", {
        body: { payment_id: paymentId, motive },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("REP cancelado");
      queryClient.invalidateQueries({ queryKey: paymentKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err) => notifyError({ error: err, message: "Error al cancelar REP" }),
  });
}
