import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdf/shared";
import { parseLineItems } from "@/lib/lineItems";

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

      // Fetch customer RFC & C.P.
      let customerRfc: string | null = null;
      let customerCp: string | null = null;
      if (quote.customer_id) {
        const { data: cust } = await supabase
          .from("customers")
          .select("rfc, domicilio_fiscal_cp")
          .eq("id", quote.customer_id)
          .single();
        if (cust) {
          customerRfc = cust.rfc;
          customerCp = cust.domicilio_fiscal_cp;
        }
      }

      const { jsPDF } = await import("jspdf");
      const {
        drawAccentBar, drawPremiumHeader, drawInfoCardsAt,
        drawPremiumTable, drawBottomSection, drawFooter,
      } = await import("@/lib/pdf/quoteGenerator");

      const doc = new jsPDF();
      const isSale = quote.quote_type === "sale";

      drawAccentBar(doc);

      let y = drawPremiumHeader(doc, company, logoBase64, quote.quote_number, isSale);

      y = drawInfoCardsAt(doc, y, quote.customer_name, quote.start_date, quote.end_date, quote.valid_until, isSale, customerRfc, customerCp, company);

      const lineItems = parseLineItems<PdfLineItem>(quote.line_items);
      const quoteCurrency = (quote as unknown as { currency?: string }).currency || "MXN";
      y = drawPremiumTable(doc, lineItems, y, quoteCurrency);

      y = drawBottomSection(
        doc, y,
        Number(quote.subtotal), Number(quote.tax_rate),
        Number(quote.tax_amount), Number(quote.total),
        quoteCurrency,
        quote.notes ? String(quote.notes) : null,
        quote.valid_until,
        !isSale,
      );

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
