import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { useInvoicePdfDownload } from "@/features/invoices/hooks/invoices/useInvoicePdfDownload";

interface InvoicePDFButtonProps {
  invoiceId: string;
}

export function InvoicePDFButton({ invoiceId }: InvoicePDFButtonProps) {
  const { download, loading } = useInvoicePdfDownload();

  return (
    <Button variant="outline" size="sm" onClick={() => download(invoiceId)} disabled={loading}>
      <FileDown className="h-4 w-4 mr-1" />
      {loading ? "Generando..." : "Descargar PDF"}
    </Button>
  );
}
