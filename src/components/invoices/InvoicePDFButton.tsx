import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdfHelpers";

const GREEN = { r: 22, g: 163, b: 74 };
const GRAY_500 = { r: 107, g: 114, b: 128 };
const GRAY_200 = { r: 229, g: 231, b: 235 };
const GRAY_900 = { r: 17, g: 24, b: 39 };
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

      // Fetch customer RFC & C.P.
      let customerRfc: string | null = null;
      let customerCp: string | null = null;
      if (invoice.customer_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("rfc, domicilio_fiscal_cp")
          .eq("id", invoice.customer_id)
          .single();
        if (cust) {
          customerRfc = cust.rfc;
          customerCp = cust.domicilio_fiscal_cp;
        }
      }
      // Fallback to invoice-level RFC if customer not found
      if (!customerRfc && invoice.receptor_rfc) customerRfc = invoice.receptor_rfc;

      const { jsPDF } = await import("jspdf");
      const {
        drawAccentBar, drawPremiumHeader, drawInfoCardsAt,
        drawPremiumTable, drawBottomSection, drawFooter,
      } = await import("@/lib/quotePdfPremium");

      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();

      // 1. Accent bar
      drawAccentBar(doc);

      // 2. Header — same as quotes
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
        doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
        doc.text(`UUID: ${invoice.cfdi_uuid}`, pw - MARGIN, y, { align: "right" });
        y += 6;
      }

      // 4. Info section — EMISOR / CLIENTE (same layout as quotes)
      y = drawInfoCardsAt(
        doc, y,
        invoice.customer_name,
        null, null, null, // no start/end/validUntil
        true, // isSale=true to skip período
        customerRfc, customerCp, company,
      );

      // 5. Compact invoice details row
      const detailY = y;
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);

      doc.text("Emitida:", MARGIN, detailY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
      doc.text(fmtDate(invoice.issued_at), MARGIN + 16, detailY);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
      doc.text("Vence:", MARGIN + 42, detailY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(GRAY_900.r, GRAY_900.g, GRAY_900.b);
      doc.text(fmtDate(invoice.due_date), MARGIN + 54, detailY);

      // Status badge
      const statusLabel = invoice.status === "paid" ? "PAGADA" : invoice.status === "cancelled" ? "CANCELADA" : "PENDIENTE";
      const statusColor = invoice.status === "paid" ? GREEN : invoice.status === "cancelled" ? { r: 220, g: 38, b: 38 } : { r: 234, g: 179, b: 8 };
      doc.setFillColor(statusColor.r, statusColor.g, statusColor.b);
      doc.roundedRect(MARGIN + 80, detailY - 3.5, 22, 5, 1, 1, "F");
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(statusLabel, MARGIN + 91, detailY, { align: "center" });

      // Payment method info
      if (invoice.forma_pago || invoice.metodo_pago) {
        const paymentInfo = [invoice.forma_pago, invoice.metodo_pago].filter(Boolean).join(" • ");
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
        doc.text(paymentInfo, pw - MARGIN, detailY, { align: "right" });
      }

      y = detailY + 8;

      // 6. Line items table
      const lineItems = (invoice.line_items as unknown as PdfLineItem[]) || [];
      const invoiceCurrency = invoice.moneda || "MXN";
      y = drawPremiumTable(doc, lineItems, y, invoiceCurrency);

      // 7. Bottom section — totals + notes
      y = drawBottomSection(
        doc, y,
        Number(invoice.subtotal), Number(invoice.tax_rate),
        Number(invoice.tax_amount), Number(invoice.total),
        invoiceCurrency,
        invoice.notes ? String(invoice.notes) : null,
        null, // no validUntil
        false, // not rental
      );

      // 8. QR placeholder for CFDI
      if (invoice.cfdi_uuid) {
        // Check page break
        const ph = doc.internal.pageSize.getHeight();
        if (y + 34 > ph - 20) {
          doc.addPage();
          drawAccentBar(doc);
          y = 16;
        }

        doc.setDrawColor(GRAY_200.r, GRAY_200.g, GRAY_200.b);
        doc.setLineWidth(0.5);
        doc.roundedRect(MARGIN, y, 28, 28, 2, 2, "S");
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRAY_500.r, GRAY_500.g, GRAY_500.b);
        doc.text("QR CFDI", MARGIN + 14, y + 16, { align: "center" });

        doc.text("Este documento es una representación impresa de un CFDI", MARGIN + 34, y + 10);
        doc.text("Verificar en: https://verificacfdi.facturaelectronica.sat.gob.mx", MARGIN + 34, y + 16);
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
