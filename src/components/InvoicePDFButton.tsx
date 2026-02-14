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

      if (error || !invoice) throw new Error("Invoice not found");

      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const mg = 20;
      let y = 20;

      // Header
      doc.setFontSize(22);
      doc.setTextColor(232, 89, 12);
      doc.text("ForkliftERP", mg, y);
      doc.setFontSize(10);
      doc.setTextColor(102, 102, 102);
      doc.text("Fleet Management", mg, y + 7);

      doc.setFontSize(24);
      doc.setTextColor(51, 51, 51);
      doc.text("INVOICE", pw - mg, y, { align: "right" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(invoice.invoice_number, pw - mg, y + 8, { align: "right" });

      y += 25;

      // Bill To / Details
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(51, 51, 51);
      doc.text("Bill To:", mg, y);
      doc.setFont("helvetica", "normal");
      doc.text(invoice.customer_name || "—", mg, y + 6);

      doc.text(`Issued: ${invoice.issued_at}`, pw - mg, y, { align: "right" });
      doc.text(`Due: ${invoice.due_date || "—"}`, pw - mg, y + 6, { align: "right" });
      doc.text(`Status: ${invoice.status.toUpperCase()}`, pw - mg, y + 12, { align: "right" });

      y += 28;

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
        doc.text(`€${Number(item.unit_price).toFixed(2)}`, 150, y, { align: "right" });
        doc.text(`€${Number(item.total).toFixed(2)}`, pw - mg, y, { align: "right" });
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
      doc.text(`€${Number(invoice.subtotal).toFixed(2)}`, pw - mg, y, { align: "right" });

      y += 7;
      doc.text(`Tax (${invoice.tax_rate}%):`, pw - mg - 50, y, { align: "right" });
      doc.text(`€${Number(invoice.tax_amount).toFixed(2)}`, pw - mg, y, { align: "right" });

      y += 4;
      doc.setDrawColor(51, 51, 51);
      doc.setLineWidth(0.5);
      doc.line(pw - mg - 70, y, pw - mg, y);

      y += 7;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Total:", pw - mg - 50, y, { align: "right" });
      doc.text(`€${Number(invoice.total).toFixed(2)}`, pw - mg, y, { align: "right" });

      // Notes
      if (invoice.notes) {
        y += 15;
        doc.setFontSize(10);
        doc.setFillColor(248, 249, 250);
        doc.roundedRect(mg, y - 5, pw - mg * 2, 20, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.text("Notes:", mg + 5, y);
        doc.setFont("helvetica", "normal");
        doc.text(String(invoice.notes), mg + 5, y + 6, { maxWidth: pw - mg * 2 - 10 });
      }

      doc.save(`${invoice.invoice_number}.pdf`);
    } catch (err: any) {
      toast.error(err.message || "Failed to download PDF");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
      <FileDown className="h-4 w-4 mr-1" />
      {loading ? "Generating..." : "Download PDF"}
    </Button>
  );
}
