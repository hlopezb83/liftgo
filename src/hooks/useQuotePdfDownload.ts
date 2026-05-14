import { useState } from "react";
import { toast } from "sonner";
import { buildQuotePdf } from "@/lib/pdf/quote/build";

export function useQuotePdfDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (quoteId: string) => {
    setLoading(true);
    try {
      await buildQuotePdf(quoteId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al descargar PDF");
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}
