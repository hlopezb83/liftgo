import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

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
 * Nota: usa `useEntityMutation` con `errorTitle` genérico pero delega el detalle
 * traducido de Facturapi al toast del mutationFn (rethrown Error mantiene mensaje).
 */
export function useStampCfdi() {
  return useEntityMutation({
    mutationFn: async (invoiceId: string): Promise<StampCfdiResponse> => {
      try {
        return await invokeEdgeFunction<StampCfdiResponse>("stamp-cfdi", {
          body: { invoice_id: invoiceId },
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        // Sobrescribimos toast de error con mensaje traducido (Facturapi tiene códigos específicos).
        notifyError({ error: err, message: translateFacturapiError(raw) });
        throw err;
      }
    },
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_data, invoiceId) => [invoiceKeys.detail(invoiceId)],
    // El toast de error ya se muestra dentro de mutationFn con mensaje traducido;
    // suprimimos el default poniendo severity warning + título neutral no bloqueante.
    errorTitle: "Error al timbrar CFDI",
    errorSeverity: "warning",
    onSuccess: (data) => {
      const suffix = data.stub
        ? " (modo prueba)"
        : data.invoice_number && data.invoice_number.startsWith("FAC-")
        ? ` — folio asignado: ${data.invoice_number}`
        : " exitosamente";
      notifySuccess(`CFDI timbrado${suffix} — UUID: ${data.cfdi_uuid}`);
    },
  });
}
