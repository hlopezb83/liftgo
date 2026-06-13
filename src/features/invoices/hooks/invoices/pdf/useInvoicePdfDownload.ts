import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { buildInvoicePdf } from "@/features/invoices/lib/pdf/build";

export function useInvoicePdfDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (invoiceId: string) => {
    setLoading(true);
    try {
      await buildInvoicePdf(invoiceId);
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al descargar PDF" });
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}
