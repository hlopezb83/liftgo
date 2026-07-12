import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess, notifyWarning } from "@/lib/ui/appFeedback";
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
  return useEntityMutation({
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
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_data, { invoiceId }) => [invoiceKeys.detail(invoiceId)],
    errorTitle: "Error al cancelar",
    onSuccess: (data) => {
      if (data?.accepted) {
        notifySuccess("CFDI cancelado ante el SAT");
      } else {
        notifyInfo("Solicitud de cancelación enviada al SAT");
      }
      if (data?.warning) notifyWarning({ title: data.warning });
    },
  });
}
