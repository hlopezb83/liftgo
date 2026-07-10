import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { buildQuotePdf } from "@/lib/pdf/quote/build";

export function useQuotePdfDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (quoteId: string) => {
    setLoading(true);
    try {
      await buildQuotePdf(quoteId);
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al descargar PDF" });
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}

