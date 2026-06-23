import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { toast } from "sonner";

import { invoiceKeys } from "../../../lib/queryKeys";
interface CancelCfdiVars {
  invoiceId: string;
  motive: string;
  substitutionUuid?: string | null;
  cancellationReason?: string | null;
}

interface CancelCfdiResponse {
  warning?: string;
  cancellation_status?: string;
  accepted?: boolean;
  error?: string;
}

/**
 * Cancela un CFDI timbrado vía edge function `cancel-cfdi`.
 */
export function useCancelCfdi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ invoiceId, motive, substitutionUuid, cancellationReason }: CancelCfdiVars): Promise<CancelCfdiResponse> => {
      return await invokeEdgeFunction<CancelCfdiResponse>("cancel-cfdi", {
        body: {
          invoice_id: invoiceId,
          motive,
          substitution_uuid: substitutionUuid || undefined,
          cancellation_reason: cancellationReason || undefined,
        },
      });
    },
    onSuccess: (data, { invoiceId }) => {
      if (data?.accepted) {
        toast.success("CFDI cancelado ante el SAT");
      } else {
        toast.info("Solicitud de cancelación enviada al SAT");
      }
      if (data?.warning) notifyWarning({ title: data.warning });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
    },
    onError: (err: unknown) => {
      notifyError({ error: err, message: "Error al cancelar" });
    },
  });
}
