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
  fmtMXN,
  type PdfLineItem,
} from "@/lib/pdfHelpers";

interface InvoicePDFButtonProps {
  invoiceId: string;
}

export function InvoicePDFButton({ invoiceId }: InvoicePDFButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

      if (error || !invoice) throw new Error("Factura no encontrada");

      const { company, logoBase64 } = await fetchCompanyDataAndLogo();

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;

      const invoiceLabel = invoice.serie && invoice.folio
        ? `${invoice.serie}-${invoice.folio}`
        : invoice.invoice_number;

      let cursorY = drawPdfHeader(doc, company, logoBase64, "FACTURA", invoiceLabel, margin);

      // CFDI UUID under header
      if (invoice.cfdi_status === "stamped" && invoice.cfdi_uuid) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(102, 102, 102);
        doc.text(`UUID: ${invoice.cfdi_uuid}`, pageWidth - margin, cursorY - 25 + 14, { align: "right" });
        cursorY += 5;
      }

      // Receptor / Details
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 51, 51);
      doc.text("Receptor:", margin, cursorY);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.customer_name || "—", margin, cursorY + 6);
      if (invoice.receptor_rfc) {
        doc.setFontSize(9);
        doc.text(`RFC: ${invoice.receptor_rfc}`, margin, cursorY + 12);
        if (invoice.receptor_regimen_fiscal) doc.text(`Régimen: ${invoice.receptor_regimen_fiscal}`, margin, cursorY + 17);
        cursorY += 10;
      }

      doc.setFontSize(10);
      const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy") : "—";
      doc.text(`Emitida: ${fmtDate(invoice.issued_at)}`, pageWidth - margin, cursorY - 4, { align: "right" });
      doc.text(`Vence: ${fmtDate(invoice.due_date)}`, pageWidth - margin, cursorY + 2, { align: "right" });
      doc.text(`Estado: ${invoice.status.toUpperCase()}`, pageWidth - margin, cursorY + 8, { align: "right" });
      if (invoice.forma_pago) doc.text(`Forma Pago: ${invoice.forma_pago}`, pageWidth - margin, cursorY + 14, { align: "right" });
      if (invoice.metodo_pago) doc.text(`Método Pago: ${invoice.metodo_pago}`, pageWidth - margin, cursorY + 20, { align: "right" });

      cursorY += 30;

      // Line items table
      const lineItems = (invoice.line_items as unknown as PdfLineItem[]) || [];
      cursorY = drawLineItemsTable(doc, lineItems, cursorY, margin);

      // Totals
      cursorY = drawTotals(doc, cursorY, Number(invoice.subtotal), Number(invoice.tax_rate), Number(invoice.tax_amount), Number(invoice.total), invoice.moneda || "MXN", margin);

      // QR placeholder for CFDI
      if (invoice.cfdi_uuid) {
        cursorY += 15;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(margin, cursorY, 30, 30);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text("QR CFDI", margin + 5, cursorY + 17);
      }

      // Notes
      if (invoice.notes) {
        const notesStartY = invoice.cfdi_uuid ? cursorY + 35 : cursorY;
        drawNotesBlock(doc, String(invoice.notes), notesStartY, margin);
      }

      doc.save(`${invoice.invoice_number}.pdf`);
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
