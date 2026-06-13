import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useInvoicePdfDownload } from "../../hooks/invoices/pdf/useInvoicePdfDownload";
import { downloadCfdiBlob } from "../../lib/downloadCfdiBlob";

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
      await downloadCfdiBlob({ invoice_id: invoiceId }, "pdf", `${invoiceNumber || invoiceId}.pdf`);
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
