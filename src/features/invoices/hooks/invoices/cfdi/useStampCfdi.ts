import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";
import { notifyInfo, notifySuccess } from "@/lib/ui/appFeedback";
import { translateFacturapiError } from "../../../lib/facturapiErrors";
import { invoiceKeys } from "../../../lib/queryKeys";

interface StampCfdiResponse {
  cfdi_uuid: string;
  stub?: boolean;
  error?: string;
  invoice_number?: string | null;
}

// R7 Bloque 12: patrones benignos que el backend devuelve cuando otra pestaña
// (o un dblclick que pasó el guard de UI) ya disparó el timbrado. Se muestran
// como info, no como error, y el consumidor sigue invalidando el detalle.
const BENIGN_STAMP_PATTERNS = [
  /already stamped/i,
  /already in progress/i,
  /timbrado en proceso/i,
  /ya (est[aá]|se encuentra) timbrada/i,
];

function isBenignStampError(raw: string): boolean {
  return BENIGN_STAMP_PATTERNS.some((r) => r.test(raw));
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
      if (isBenignStampError(raw)) {
        // Devolvemos string vacío; onError abajo intercepta y muestra info en su lugar.
        return "";
      }
      return translateFacturapiError(raw);
    },
    onError: (error) => {
      const raw = error instanceof Error ? error.message : String(error);
      if (isBenignStampError(raw)) {
        notifyInfo("El timbrado ya está en proceso; actualizando estado…");
      }
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
