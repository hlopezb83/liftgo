import { Button } from "@/components/ui/button";
import { DocumentIcon } from "@/components/icons";
import { useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { useInvoicePdfDownload } from "../../hooks/invoices/pdf/useInvoicePdfDownload";
import { downloadCfdiBlob } from "../../lib/downloadCfdiBlob";

interface InvoicePDFButtonProps {
  invoiceId: string;
  /** "draft" = PDF interno, "cfdi" = PDF timbrado por Facturapi. */
  mode: "draft" | "cfdi";
  invoiceNumber?: string;
}

export function InvoicePDFButton({ invoiceId, mode, invoiceNumber }: InvoicePDFButtonProps) {
  const { download, loading } = useInvoicePdfDownload();
  const [satLoading, setSatLoading] = useState(false);
  const isCfdi = mode === "cfdi";

  const handleClick = async () => {
    if (!isCfdi) {
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
      <DocumentIcon className="h-4 w-4 mr-1" />
      {busy ? "Generando…" : isCfdi ? "CFDI PDF" : "PDF borrador"}
    </Button>
  );
}
