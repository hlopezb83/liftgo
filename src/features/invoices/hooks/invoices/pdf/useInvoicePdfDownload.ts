import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { buildInvoicePdf } from "../../../lib/pdf/build";
import { fetchInvoicePdfData } from "../../../api/fetchInvoicePdfData";

export function useInvoicePdfDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (invoiceId: string) => {
    setLoading(true);
    try {
      const payload = await fetchInvoicePdfData(invoiceId);
      await buildInvoicePdf(payload);
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al descargar PDF" });
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}
