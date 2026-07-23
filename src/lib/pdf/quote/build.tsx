import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { parseLineItems } from "@/lib/domain/lineItems";
import { QuoteDocument, type QuoteDocumentProps } from "@/lib/pdf/documents/QuoteDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";
import { fetchCompanyDataAndLogo, type PdfLineItem } from "@/lib/pdf/shared";

export async function fetchQuotePdfData(quoteId: string): Promise<QuoteDocumentProps> {
  // v7.216.0 (C6): columnas explícitas.
  const QUOTE_PDF_COLUMNS =
    "id, quote_number, quote_type, customer_id, customer_name, forklift_id, equipment_model_id, " +
    "start_date, end_date, valid_until, status, currency, line_items, rental_meta, " +
    "subtotal, tax_rate, tax_amount, total, notes, version, accepted_at, accepted_by_user_id, " +
    "accepted_ip, rejected_at, rejection_reason, e2e_scope, is_e2e, created_at, updated_at";
  const { data: quote, error } = await supabase
    .from("quotes").select(QUOTE_PDF_COLUMNS).eq("id", quoteId).single().returns<Tables<"quotes">>();
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
  await renderAndSave(<QuoteDocument {...data} />, `${data.quoteNumber}.pdf`);
}
