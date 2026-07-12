import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifySuccess } from "@/lib/ui/appFeedback";
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
 * Ahora usa `useEntityMutation` con `errorMessage` dinámico para traducir
 * códigos de error de Facturapi sin renunciar a la invalidación estándar.
 */
export function useStampCfdi() {
  return useEntityMutation<string, StampCfdiResponse>({
    mutationFn: async (invoiceId) => {
      return await invokeEdgeFunction<StampCfdiResponse>("stamp-cfdi", {
        body: { invoice_id: invoiceId },
      });
    },
    invalidateKeys: [invoiceKeys.all],
    invalidateKeysFn: (_data, invoiceId) => [invoiceKeys.detail(invoiceId)],
    errorTitle: "Error al timbrar CFDI",
    errorMessage: (error) => {
      const raw = error instanceof Error ? error.message : String(error);
      return translateFacturapiError(raw);
    },
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
