import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { format, parseISO } from "date-fns";
import {
  fetchCompanyDataAndLogo,
  drawPdfHeader,
  drawLineItemsTable,
  drawTotals,
  drawNotesBlock,
  type PdfLineItem,
} from "@/lib/pdfHelpers";

interface QuotePDFButtonProps {
  quoteId: string;
}

export function QuotePDFButton({ quoteId }: QuotePDFButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const { data: quote, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single();

      if (error || !quote) throw new Error("Cotización no encontrada");

      const { company, logoBase64 } = await fetchCompanyDataAndLogo();

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;

      const isSale = (quote as any).quote_type === "sale";
      let cursorY = drawPdfHeader(doc, company, logoBase64, isSale ? "COTIZACIÓN DE VENTA" : "COTIZACIÓN", quote.quote_number, margin);

      // Cliente / Detalles
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 51, 51);
      doc.text("Cliente:", margin, cursorY);
      doc.setFont("helvetica", "normal");
      doc.text(quote.customer_name || "—", margin, cursorY + 6);

      doc.setFontSize(10);
      const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy") : "—";
      if (!isSale && quote.start_date && quote.end_date) {
        doc.text(`Periodo: ${fmtDate(quote.start_date)} → ${fmtDate(quote.end_date)}`, pageWidth - margin, cursorY, { align: "right" });
        doc.text(`Válida Hasta: ${fmtDate(quote.valid_until)}`, pageWidth - margin, cursorY + 6, { align: "right" });
      } else {
        doc.text(`Válida Hasta: ${fmtDate(quote.valid_until)}`, pageWidth - margin, cursorY, { align: "right" });
      }

      cursorY += 20;

      // Line items table
      const lineItems = (quote.line_items as unknown as PdfLineItem[]) || [];
      cursorY = drawLineItemsTable(doc, lineItems, cursorY, margin);

      // Totals
      cursorY = drawTotals(doc, cursorY, Number(quote.subtotal), Number(quote.tax_rate), Number(quote.tax_amount), Number(quote.total), "MXN", margin);

      // Notes
      if (quote.notes) {
        drawNotesBlock(doc, String(quote.notes), cursorY, margin);
      }

      doc.save(`${quote.quote_number}.pdf`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al descargar PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
      <FileDown className="h-4 w-4 mr-1" />
      {loading ? "Generando..." : "Descargar PDF"}
    </Button>
  );
}
