import { FileDown } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useQuotePdfDownload } from "../../hooks/quotes/useQuotePdfDownload";

interface QuotePDFButtonProps {
  quoteId: string;
}

export function QuotePDFButton({ quoteId }: QuotePDFButtonProps) {
  const { download, loading } = useQuotePdfDownload();

  return (
    <Button variant="outline" size="sm" onClick={() => download(quoteId)} disabled={loading}>
      <FileDown className="h-4 w-4 mr-1" />
      {loading ? "Generando..." : "Descargar PDF"}
    </Button>
  );
}
