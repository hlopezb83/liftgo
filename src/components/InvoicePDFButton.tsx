import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

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

      // Fetch company settings for issuer info
      const { data: company } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      const inv = invoice as any;
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const mg = 20;
      let y = 20;

      // Header
      doc.setFontSize(22);
      doc.setTextColor(232, 89, 12);
      doc.text(company?.razon_social || "ForkliftERP", mg, y);
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      if (company) {
        doc.text(`RFC: ${company.rfc} | Régimen: ${company.regimen_fiscal} | C.P.: ${company.lugar_expedicion}`, mg, y + 7);
      } else {
        doc.text("Fleet Management", mg, y + 7);
      }

      doc.setFontSize(24);
      doc.setTextColor(51, 51, 51);
      doc.text("FACTURA", pw - mg, y, { align: "right" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      const invoiceLabel = inv.serie && inv.folio
        ? `${inv.serie}-${inv.folio}`
        : invoice.invoice_number;
      doc.text(invoiceLabel, pw - mg, y + 8, { align: "right" });

      if (inv.cfdi_status === "stamped" && inv.cfdi_uuid) {
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(102, 102, 102);
        doc.text(`UUID: ${inv.cfdi_uuid}`, pw - mg, y + 14, { align: "right" });
        y += 5;
      }

      y += 25;

      // Bill To / Details
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 51, 51);
      doc.text("Receptor:", mg, y);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.customer_name || "—", mg, y + 6);
      if (inv.receptor_rfc) {
        doc.setFontSize(9);
        doc.text(`RFC: ${inv.receptor_rfc}`, mg, y + 12);
        if (inv.receptor_regimen_fiscal) doc.text(`Régimen: ${inv.receptor_regimen_fiscal}`, mg, y + 17);
        y += 10;
      }

      doc.setFontSize(10);
      doc.text(`Emitida: ${invoice.issued_at}`, pw - mg, y - 4, { align: "right" });
      doc.text(`Vence: ${invoice.due_date || "—"}`, pw - mg, y + 2, { align: "right" });
      doc.text(`Estado: ${invoice.status.toUpperCase()}`, pw - mg, y + 8, { align: "right" });
      if (inv.forma_pago) doc.text(`Forma Pago: ${inv.forma_pago}`, pw - mg, y + 14, { align: "right" });
      if (inv.metodo_pago) doc.text(`Método Pago: ${inv.metodo_pago}`, pw - mg, y + 20, { align: "right" });

      y += 30;

      // Table header
      doc.setFillColor(248, 249, 250);
      doc.rect(mg, y - 5, pw - mg * 2, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Description", mg + 2, y);
      doc.text("Qty", 120, y, { align: "right" });
      doc.text("Unit Price", 150, y, { align: "right" });
      doc.text("Total", pw - mg, y, { align: "right" });

      y += 4;
      doc.setDrawColor(222, 226, 230);
      doc.setLineWidth(0.5);
      doc.line(mg, y, pw - mg, y);
      y += 6;

      // Rows
      const lineItems = (invoice.line_items as any[]) || [];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const item of lineItems) {
        doc.text(String(item.description || ""), mg + 2, y);
        doc.text(String(item.quantity), 120, y, { align: "right" });
        doc.text(`$${Number(item.unit_price).toFixed(2)}`, 150, y, { align: "right" });
        doc.text(`$${Number(item.total).toFixed(2)}`, pw - mg, y, { align: "right" });
        y += 3;
        doc.setDrawColor(238, 238, 238);
        doc.setLineWidth(0.2);
        doc.line(mg, y, pw - mg, y);
        y += 5;
      }

      // Totals
      y += 5;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text("Subtotal:", pw - mg - 50, y, { align: "right" });
      doc.text(`$${Number(invoice.subtotal).toFixed(2)}`, pw - mg, y, { align: "right" });

      y += 7;
      doc.text(`IVA (${invoice.tax_rate}%):`, pw - mg - 50, y, { align: "right" });
      doc.text(`$${Number(invoice.tax_amount).toFixed(2)}`, pw - mg, y, { align: "right" });

      y += 4;
      doc.setDrawColor(51, 51, 51);
      doc.setLineWidth(0.5);
      doc.line(pw - mg - 70, y, pw - mg, y);

      y += 7;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Total:", pw - mg - 50, y, { align: "right" });
      doc.text(`$${Number(invoice.total).toFixed(2)} ${inv.moneda || "MXN"}`, pw - mg, y, { align: "right" });

      // QR placeholder area for CFDI
      if (inv.cfdi_uuid) {
        y += 15;
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(mg, y, 30, 30);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text("QR CFDI", mg + 5, y + 17);
      }

      // Notes
      if (invoice.notes) {
        y += (inv.cfdi_uuid ? 35 : 15);
        doc.setFontSize(10);
        doc.setTextColor(51, 51, 51);
        doc.setFillColor(248, 249, 250);
        doc.roundedRect(mg, y - 5, pw - mg * 2, 20, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.text("Notas:", mg + 5, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(invoice.notes), mg + 5, y + 6, { maxWidth: pw - mg * 2 - 10 });
      }

      doc.save(`${invoice.invoice_number}.pdf`);
    } catch (err: any) {
      toast.error(err.message || "Error al descargar PDF");
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
