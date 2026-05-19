import { supabase } from "@/integrations/supabase/client";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdf/shared";
import { parseLineItems } from "@/lib/lineItems";
import type { QuoteDocumentProps } from "@/lib/pdf/documents/QuoteDocument";

export async function fetchQuotePdfData(quoteId: string): Promise<QuoteDocumentProps> {
  const { data: quote, error } = await supabase
    .from("quotes").select("*").eq("id", quoteId).single();
  if (error || !quote) throw new Error("Cotización no encontrada");

  const { company, logoBase64 } = await fetchCompanyDataAndLogo();

  let customerRfc: string | null = null;
  let customerCp: string | null = null;
  if (quote.customer_id) {
    const { data: cust } = await supabase
      .from("customers").select("rfc, domicilio_fiscal_cp").eq("id", quote.customer_id).single();
    if (cust) { customerRfc = cust.rfc; customerCp = cust.domicilio_fiscal_cp; }
  }

  const isSale = quote.quote_type === "sale";
  const lineItems = parseLineItems<PdfLineItem>(quote.line_items);
  const currency = (quote as unknown as { currency?: string }).currency || "MXN";

  return {
    company, logoBase64,
    quoteNumber: quote.quote_number,
    customerName: quote.customer_name,
    customerRfc, customerCp,
    startDate: quote.start_date,
    endDate: quote.end_date,
    validUntil: quote.valid_until,
    isSale,
    lineItems,
    subtotal: Number(quote.subtotal),
    taxRate: Number(quote.tax_rate),
    taxAmount: Number(quote.tax_amount),
    total: Number(quote.total),
    currency,
    notes: quote.notes ? String(quote.notes) : null,
  };
}

export async function buildQuotePdf(quoteId: string): Promise<void> {
  const data = await fetchQuotePdfData(quoteId);
  const [{ pdf }, { saveAs }, { QuoteDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("file-saver"),
    import("@/lib/pdf/documents/QuoteDocument"),
  ]);
  const blob = await pdf(<QuoteDocument {...data} />).toBlob();
  saveAs(blob, `${data.quoteNumber}.pdf`);
}
