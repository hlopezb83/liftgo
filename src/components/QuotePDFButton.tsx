import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { loadImageAsBase64 } from "@/lib/loadImageAsBase64";
import { format, parseISO } from "date-fns";

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

      const { data: company } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      let logoBase64: string | null = null;
      if (company?.logo_url) {
        logoBase64 = await loadImageAsBase64(company.logo_url);
      }

      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const mg = 20;
      let y = 20;

      // Logo + Header
      const textStartX = logoBase64 ? mg + 25 : mg;

      if (logoBase64) {
        doc.addImage(logoBase64, "PNG", mg, y - 5, 20, 20);
      }

      doc.setFontSize(22);
      doc.setTextColor(232, 89, 12);
      doc.text(company?.razon_social || "LiftGo", textStartX, y);
      doc.setFontSize(9);
      doc.setTextColor(102, 102, 102);
      if (company) {
        doc.text(`RFC: ${company.rfc} | Régimen: ${company.regimen_fiscal} | C.P.: ${company.lugar_expedicion}`, textStartX, y + 7);
      } else {
        doc.text("Gestión de Flota", textStartX, y + 7);
      }

      doc.setFontSize(24);
      doc.setTextColor(51, 51, 51);
      const isSale = (quote as any).quote_type === "sale";
      doc.text(isSale ? "COTIZACIÓN DE VENTA" : "COTIZACIÓN", pw - mg, y, { align: "right" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(quote.quote_number, pw - mg, y + 8, { align: "right" });

      y += 25;

      // Cliente / Detalles
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 51, 51);
      doc.text("Cliente:", mg, y);
      doc.setFont("helvetica", "normal");
      doc.text(quote.customer_name || "—", mg, y + 6);

      doc.setFontSize(10);
      const fmtDate = (d: string | null) => d ? format(parseISO(d), "dd/MM/yyyy") : "—";
      if (!isSale && quote.start_date && quote.end_date) {
        doc.text(`Periodo: ${fmtDate(quote.start_date)} → ${fmtDate(quote.end_date)}`, pw - mg, y, { align: "right" });
        doc.text(`Válida Hasta: ${fmtDate(quote.valid_until)}`, pw - mg, y + 6, { align: "right" });
      } else {
        doc.text(`Válida Hasta: ${fmtDate(quote.valid_until)}`, pw - mg, y, { align: "right" });
      }

      y += 20;

      // Table header
      doc.setFillColor(248, 249, 250);
      doc.rect(mg, y - 5, pw - mg * 2, 10, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Descripción", mg + 2, y);
      doc.text("Cant.", 120, y, { align: "right" });
      doc.text("Precio Unit.", 150, y, { align: "right" });
      doc.text("Total", pw - mg, y, { align: "right" });

      y += 4;
      doc.setDrawColor(222, 226, 230);
      doc.setLineWidth(0.5);
      doc.line(mg, y, pw - mg, y);
      y += 6;

      // Rows
      const lineItems = (quote.line_items as unknown as { description: string; quantity: number; unit_price: number; total: number }[]) || [];
      const fmtMXN = (n: number) =>
        `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      for (const item of lineItems) {
        doc.text(String(item.description || ""), mg + 2, y);
        doc.text(String(item.quantity), 120, y, { align: "right" });
        doc.text(fmtMXN(Number(item.unit_price)), 150, y, { align: "right" });
        doc.text(fmtMXN(Number(item.total)), pw - mg, y, { align: "right" });
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
      doc.text(fmtMXN(Number(quote.subtotal)), pw - mg, y, { align: "right" });

      y += 7;
      doc.text(`IVA (${quote.tax_rate}%):`, pw - mg - 50, y, { align: "right" });
      doc.text(fmtMXN(Number(quote.tax_amount)), pw - mg, y, { align: "right" });

      y += 4;
      doc.setDrawColor(51, 51, 51);
      doc.setLineWidth(0.5);
      doc.line(pw - mg - 70, y, pw - mg, y);

      y += 7;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Total:", pw - mg - 50, y, { align: "right" });
      doc.text(`${fmtMXN(Number(quote.total))} MXN`, pw - mg, y, { align: "right" });

      // Notes
      if (quote.notes) {
        y += 15;
        doc.setFontSize(10);
        doc.setTextColor(51, 51, 51);
        doc.setFillColor(248, 249, 250);
        doc.roundedRect(mg, y - 5, pw - mg * 2, 20, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.text("Notas:", mg + 5, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(quote.notes), mg + 5, y + 6, { maxWidth: pw - mg * 2 - 10 });
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
