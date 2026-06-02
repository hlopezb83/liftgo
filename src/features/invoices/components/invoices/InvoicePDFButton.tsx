import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";
import { useInvoicePdfDownload } from "@/features/invoices/hooks/invoices/useInvoicePdfDownload";

interface InvoicePDFButtonProps {
  invoiceId: string;
  cfdiStatus?: string;
  invoiceNumber?: string;
}

export function InvoicePDFButton({ invoiceId, cfdiStatus, invoiceNumber }: InvoicePDFButtonProps) {
  const { download, loading } = useInvoicePdfDownload();
  const [satLoading, setSatLoading] = useState(false);
  const isStamped = cfdiStatus === "stamped";

  const handleClick = async () => {
    if (!isStamped) {
      await download(invoiceId);
      return;
    }
    setSatLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("download-cfdi", {
        body: { invoice_id: invoiceId, format: "pdf" },
      });
      if (error) throw error;
      const blob = data instanceof Blob ? data : new Blob([data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoiceNumber || invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      notifyError({ error: err, message: "Error al descargar PDF SAT" });
    } finally {
      setSatLoading(false);
    }
  };

  const busy = loading || satLoading;
  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={busy}>
      <FileDown className="h-4 w-4 mr-1" />
      {busy ? "Generando..." : isStamped ? "Descargar PDF SAT" : "Descargar PDF"}
    </Button>
  );
}
