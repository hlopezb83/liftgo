import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CancelCfdiVars {
  invoiceId: string;
  cancellationReason: string;
}

interface CancelCfdiResponse {
  warning?: string;
  error?: string;
}

/**
 * Cancela un CFDI timbrado vía edge function `cancel-cfdi`.
 */
export function useCancelCfdi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, cancellationReason }: CancelCfdiVars): Promise<CancelCfdiResponse> => {
      const { data, error } = await supabase.functions.invoke("cancel-cfdi", {
        body: { invoice_id: invoiceId, cancellation_reason: cancellationReason },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CancelCfdiResponse;
    },
    onSuccess: (data, { invoiceId }) => {
      toast.success("CFDI cancelado");
      if (data?.warning) toast.warning(data.warning);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Error al cancelar");
    },
  });
}
