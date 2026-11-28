import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { fetchQuotePdfData } from "./pdf/fetchQuotePdfData";

export function useQuotePdfDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (quoteId: string) => {
    setLoading(true);
    try {
      // Lazy: keep @react-pdf/renderer (~1.46 MB) out of the initial bundle.
      const [data, { buildQuotePdf }] = await Promise.all([
        fetchQuotePdfData(quoteId),
        import("@/lib/pdf/quote/build"),
      ]);
      await buildQuotePdf(data);
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al descargar PDF" });
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}
