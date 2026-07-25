import { useState, useCallback } from "react";
import { downloadCfdiBlob } from "@/features/invoices";
import { notifyError } from "@/lib/ui/appFeedback";

interface InvoiceLike {
  id: string;
  invoice_number: string;
  cfdi_uuid: string | null;
}

/**
 * Encapsula estado y handler de descarga CFDI (PDF/XML) del portal.
 * Extraído de PortalInvoiceDetail (v7.226.3) para bajar complejidad ciclomática.
 */
export function useCfdiDownload(invoice: InvoiceLike | undefined) {
  const [downloading, setDownloading] = useState<"pdf" | "xml" | null>(null);

  const download = useCallback(
    async (fmt: "pdf" | "xml") => {
      if (!invoice?.cfdi_uuid) return;
      setDownloading(fmt);
      try {
        await downloadCfdiBlob({ invoice_id: invoice.id }, fmt, `${invoice.invoice_number}.${fmt}`);
      } catch (err: unknown) {
        notifyError({ error: err, message: `No se pudo descargar el ${fmt.toUpperCase()} SAT` });
      } finally {
        setDownloading(null);
      }
    },
    [invoice],
  );

  return { downloading, download };
}
