import { toast } from "sonner";
import { fetchCfdiBlob, triggerBlobDownload } from "../../lib/downloadCfdiBlob";
import type { Tables } from "@/integrations/supabase/types";

export function useDownloadInvoiceXml() {
  return async (invoice: Tables<"invoices"> | undefined) => {
    if (!invoice) return;
    const filename = `${invoice.invoice_number}.xml`;
    try {
      const blob = await fetchCfdiBlob({ invoice_id: invoice.id }, "xml");
      triggerBlobDownload(blob, filename);
    } catch (err) {
      if (invoice.cfdi_xml) {
        triggerBlobDownload(new Blob([invoice.cfdi_xml], { type: "application/xml" }), filename);
        return;
      }
      toast.error("Error al descargar XML", {
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    }
  };
}
