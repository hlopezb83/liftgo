import { notifyValidation } from "@/lib/ui/appFeedback";
import { backfillStampSnapshot } from "../../lib/backfillStampSnapshot";
import { getMissingStampFields } from "../../lib/cfdiPrechecks";
import { useStampCfdi } from "../invoices/cfdi/useStampCfdi";
import type { Tables } from "@/integrations/supabase/types";

export function useStampInvoiceFlow(refetch: () => void) {
  const stampCfdi = useStampCfdi();

  const run = async (invoice: Tables<"invoices"> | undefined) => {
    if (!invoice) return;
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
    stampCfdi.mutate(invoice.id, { onSuccess: () => refetch() });
  };

  return { stampCfdi, run };
}
