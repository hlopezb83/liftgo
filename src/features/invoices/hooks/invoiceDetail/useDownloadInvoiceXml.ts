import type { Tables } from "@/integrations/supabase/types";
import { notifyError } from "@/lib/ui/appFeedback";
import { fetchCfdiBlob, triggerBlobDownload } from "../../lib/downloadCfdiBlob";

export function useDownloadInvoiceXml() {
  return async (invoice: Tables<"invoices"> | undefined) => {
    if (!invoice) return;
    const filename = `${invoice.invoice_number}.xml`;
    try {
      const blob = await fetchCfdiBlob({ invoice_id: invoice.id }, "xml");
      triggerBlobDownload(blob, filename);
    } catch (err: unknown) {
      if (invoice.cfdi_xml) {
        triggerBlobDownload(new Blob([invoice.cfdi_xml], { type: "application/xml" }), filename);
        return;
      }
      notifyError({
        error: err,
        title: "Error al descargar XML",
        phase: "fetchCfdiBlob",
        context: { invoice_id: invoice.id },
      });
    }
  };
}
