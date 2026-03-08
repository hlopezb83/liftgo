import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdfHelpers";
import {
  drawAccentBar,
  drawPremiumHeader,
  drawInfoCardsAt,
  drawPremiumTable,
  drawPremiumTotals,
  drawPremiumNotes,
  drawTermsSection,
  drawFooter,
} from "@/lib/quotePdfPremium";

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

      // Fetch customer fiscal data if available
      let customerRfc: string | null = null;
      let customerCp: string | null = null;
      if (quote.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("rfc, domicilio_fiscal_cp")
          .eq("id", quote.customer_id)
          .single();
        if (customer) {
          customerRfc = customer.rfc;
          customerCp = customer.domicilio_fiscal_cp;
        }
      }

      const { company, logoBase64 } = await fetchCompanyDataAndLogo();

      const doc = new jsPDF();
      const isSale = (quote as any).quote_type === "sale";

      // 1. Accent bar
      drawAccentBar(doc);

      // 2. Header
      let y = drawPremiumHeader(doc, company, logoBase64, quote.quote_number, isSale);

      // 3. Info cards (client + details)
      y = drawInfoCardsAt(doc, y, quote.customer_name, quote.start_date, quote.end_date, quote.valid_until, isSale, customerRfc, customerCp);

      // 4. Line items table
      const lineItems = (quote.line_items as unknown as PdfLineItem[]) || [];
      y = drawPremiumTable(doc, lineItems, y);

      // 5. Totals
      y = drawPremiumTotals(doc, y, Number(quote.subtotal), Number(quote.tax_rate), Number(quote.tax_amount), Number(quote.total));

      // 6. Notes (optional)
      if (quote.notes) {
        y = drawPremiumNotes(doc, String(quote.notes), y);
      }

      // 7. Terms
      drawTermsSection(doc, y, quote.valid_until);

      // 8. Footer
      drawFooter(doc, company);

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
