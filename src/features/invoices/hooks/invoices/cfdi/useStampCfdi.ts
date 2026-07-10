import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

import { translateFacturapiError } from "../../../lib/facturapiErrors";

import { invoiceKeys } from "../../../lib/queryKeys";

interface StampCfdiResponse {
  cfdi_uuid: string;
  stub?: boolean;
  error?: string;
  invoice_number?: string | null;
}

/**
 * Timbra una factura ante el PAC (Facturapi) vía edge function `stamp-cfdi`.
 * NOTA: no se migra a `useEntityMutation` porque el título del toast de error
 * requiere traducción dinámica del código Facturapi (no encaja con `errorTitle` estático).
 */
export function useStampCfdi() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceId: string): Promise<StampCfdiResponse> => {
      return await invokeEdgeFunction<StampCfdiResponse>("stamp-cfdi", {
        body: { invoice_id: invoiceId },
      });
    },
    onSuccess: (data, invoiceId) => {
      const suffix = data.stub
        ? " (modo prueba)"
        : data.invoice_number && data.invoice_number.startsWith("FAC-")
        ? ` — folio asignado: ${data.invoice_number}`
        : " exitosamente";
      notifySuccess(`CFDI timbrado${suffix} — UUID: ${data.cfdi_uuid}`);
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.detail(invoiceId) });
    },
    onError: (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err);
      notifyError({ error: err, message: translateFacturapiError(raw) });
    },
  });
}
