import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdfHelpers";

// ─── Brand Colors ─────────────────────────────────────
const NAVY = { r: 15, g: 23, b: 42 };
const GRAY_BG = { r: 248, g: 250, b: 252 };
const GRAY_TEXT = { r: 100, g: 116, b: 139 };
const GRAY_BORDER = { r: 226, g: 232, b: 240 };
const DARK_TEXT = { r: 15, g: 23, b: 42 };
const GREEN = { r: 22, g: 163, b: 74 };
const MARGIN = 20;

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try { return format(parseISO(d), "dd/MM/yyyy"); } catch { return "—"; }
}

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

      const { jsPDF } = await import("jspdf");
      const {
        drawAccentBar, drawPremiumHeader, drawPremiumTable,
        drawPremiumTotals, drawPremiumNotes, drawFooter,
      } = await import("@/lib/quotePdfPremium");

      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();

      // 1. Accent bar
      drawAccentBar(doc);

      // 2. Custom invoice header
      const invoiceLabel = invoice.serie && invoice.folio
        ? `${invoice.serie}-${invoice.folio}`
        : invoice.invoice_number;

      let y = drawPremiumHeader(doc, company, logoBase64, invoiceLabel, "FACTURA");

      // 3. CFDI UUID badge if stamped
      if (invoice.cfdi_status === "stamped" && invoice.cfdi_uuid) {
        doc.setFillColor(GREEN.r, GREEN.g, GREEN.b);
        doc.roundedRect(pw - MARGIN - 70, y - 6, 70, 8, 2, 2, "F");
        doc.setFontSize(6);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(255, 255, 255);
        doc.text("TIMBRADO SAT", pw - MARGIN - 35, y - 1, { align: "center" });
        y += 4;
        
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
        doc.text(`UUID: ${invoice.cfdi_uuid}`, pw - MARGIN, y, { align: "right" });
        y += 8;
      }

      // 4. Info cards (Receptor + Detalles)
      const cardWidth = (pw - MARGIN * 2 - 8) / 2;

      // ── Receptor Card ──
      doc.setFillColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
      doc.roundedRect(MARGIN, y, cardWidth, 32, 2, 2, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
      doc.text("RECEPTOR", MARGIN + 6, y + 7);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      doc.text(invoice.customer_name || "—", MARGIN + 6, y + 15);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
      if (invoice.receptor_rfc) {
        doc.text(`RFC: ${invoice.receptor_rfc}`, MARGIN + 6, y + 22);
      }
      if (invoice.receptor_regimen_fiscal) {
        doc.text(`Régimen: ${invoice.receptor_regimen_fiscal}`, MARGIN + 6, y + 28);
      }

      // ── Details Card ──
      const cardX = MARGIN + cardWidth + 8;
      doc.setFillColor(GRAY_BG.r, GRAY_BG.g, GRAY_BG.b);
      doc.roundedRect(cardX, y, cardWidth, 32, 2, 2, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
      doc.text("DETALLES", cardX + 6, y + 7);

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(DARK_TEXT.r, DARK_TEXT.g, DARK_TEXT.b);
      doc.text("Emitida:", cardX + 6, y + 14);
      doc.setFont("helvetica", "normal");
      doc.text(fmtDate(invoice.issued_at), cardX + 24, y + 14);

      doc.setFont("helvetica", "bold");
      doc.text("Vence:", cardX + 6, y + 20);
      doc.setFont("helvetica", "normal");
      doc.text(fmtDate(invoice.due_date), cardX + 22, y + 20);
      
      // Status badge
      const statusLabel = invoice.status === "paid" ? "PAGADA" : invoice.status === "cancelled" ? "CANCELADA" : "PENDIENTE";
      const statusColor = invoice.status === "paid" ? GREEN : invoice.status === "cancelled" ? { r: 220, g: 38, b: 38 } : { r: 234, g: 179, b: 8 };
      doc.setFillColor(statusColor.r, statusColor.g, statusColor.b);
      doc.roundedRect(cardX + 6, y + 24, 30, 6, 1, 1, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(statusLabel, cardX + 21, y + 28.5, { align: "center" });

      // Payment method info
      if (invoice.forma_pago || invoice.metodo_pago) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
        const paymentInfo = [invoice.forma_pago, invoice.metodo_pago].filter(Boolean).join(" • ");
        doc.text(paymentInfo, cardX + cardWidth - 6, y + 28, { align: "right" });
      }

      y += 40;

      // 5. Line items table
      const lineItems = (invoice.line_items as unknown as PdfLineItem[]) || [];
      y = drawPremiumTable(doc, lineItems, y);

      // 6. Totals
      y = drawPremiumTotals(doc, y, Number(invoice.subtotal), Number(invoice.tax_rate), Number(invoice.tax_amount), Number(invoice.total));

      // 7. QR placeholder for CFDI
      if (invoice.cfdi_uuid) {
        y += 10;
        doc.setDrawColor(GRAY_BORDER.r, GRAY_BORDER.g, GRAY_BORDER.b);
        doc.setLineWidth(0.5);
        doc.roundedRect(MARGIN, y, 28, 28, 2, 2, "S");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY_TEXT.r, GRAY_TEXT.g, GRAY_TEXT.b);
        doc.text("QR CFDI", MARGIN + 14, y + 16, { align: "center" });

        // Cadena original placeholder
        doc.setFontSize(6);
        doc.text("Este documento es una representación impresa de un CFDI", MARGIN + 34, y + 10);
        doc.text("Verificar en: https://verificacfdi.facturaelectronica.sat.gob.mx", MARGIN + 34, y + 16);
      }

      // 8. Notes
      if (invoice.notes) {
        const notesStartY = invoice.cfdi_uuid ? y + 34 : y;
        y = drawPremiumNotes(doc, String(invoice.notes), notesStartY);
      }

      // 9. Footer
      drawFooter(doc, company);

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
