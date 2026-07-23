import { useRef, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { notifyValidation } from "@/lib/ui/appFeedback";
import { backfillStampSnapshot } from "../../lib/backfillStampSnapshot";
import { getMissingStampFields } from "../../lib/cfdiPrechecks";
import { classifyFacturapiError, type FacturapiErrorKind } from "../../lib/facturapiErrors";
import { useStampCfdi } from "../invoices/cfdi/useStampCfdi";

// R10 Bloque 8.4: errores benignos ("already stamped", "in progress") ya se
// muestran como toast info desde useStampCfdi.onError; NO debemos abrir el
// StampErrorDialog aquí porque la 2ª pestaña vería un modal de error espurio.
const BENIGN_STAMP_PATTERNS = [
  /already stamped/i,
  /already in progress/i,
  /timbrado en proceso/i,
  /ya (est[aá]|se encuentra) timbrada/i,
];
const isBenignStampError = (raw: string) => BENIGN_STAMP_PATTERNS.some((r) => r.test(raw));



export interface StampErrorState {
  message: string;
  kind: FacturapiErrorKind;
  customerId: string | null;
  receptor?: {
    rfc: string | null;
    razonSocial: string | null;
    cp: string | null;
    regimenFiscal: string | null;
  };
}


export function useStampInvoiceFlow(refetch: () => void) {
  const stampCfdi = useStampCfdi();
  const [stampError, setStampError] = useState<StampErrorState | null>(null);
  // R9 Bloque 2: ref síncrono para bloquear doble-click durante el
  // `await backfillStampSnapshot()`. Sin esto, un segundo click <25ms
  // dispara 2 timbrados (la 2ª llamada dispara un toast info duplicado).
  const inFlightRef = useRef(false);

  const run = async (invoice: Tables<"invoices"> | undefined) => {
    if (!invoice) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const hydrated = await backfillStampSnapshot(invoice);
      const missing = getMissingStampFields(hydrated);
      if (missing.length > 0) {
        notifyValidation({
          title: "Faltan datos para timbrar",
          message: `Completa en el cliente o en la factura: ${missing.join(", ")}.`,
        });
        refetch();
        return;
      }
      if (hydrated !== invoice) refetch();
      stampCfdi.mutate(invoice.id, {
        onSuccess: () => refetch(),
        onError: (err) => {
          const raw = err instanceof Error ? err.message : String(err);
          if (isBenignStampError(raw)) return; // toast info ya cubierto
          const classified = classifyFacturapiError(raw);
          setStampError({
            message: classified.message,
            kind: classified.kind,
            customerId: invoice.customer_id ?? null,
            receptor: {
              rfc: hydrated.receptor_rfc ?? null,
              razonSocial: hydrated.receptor_razon_social ?? null,
              cp: hydrated.receptor_domicilio_fiscal_cp ?? null,
              regimenFiscal: hydrated.receptor_regimen_fiscal ?? null,
            },
          });
        },
        onSettled: () => { inFlightRef.current = false; },
      });

    } catch (err) {
      inFlightRef.current = false;
      throw err;
    }
  };


  return {
    stampCfdi,
    run,
    stampError,
    clearStampError: () => setStampError(null),
  };
}
