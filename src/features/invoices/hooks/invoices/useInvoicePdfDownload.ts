import { useState } from "react";
import { toast } from "sonner";
import { buildInvoicePdf } from "@/lib/pdf/invoice/build";

export function useInvoicePdfDownload() {
  const [loading, setLoading] = useState(false);

  const download = async (invoiceId: string) => {
    setLoading(true);
    try {
      await buildInvoicePdf(invoiceId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al descargar PDF");
    } finally {
      setLoading(false);
    }
  };

  return { download, loading };
}
