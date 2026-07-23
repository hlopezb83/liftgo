import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

export type CreditNote = Tables<"credit_notes">;

// v7.216.0 (C6): columnas explícitas.
const CREDIT_NOTE_COLUMNS =
  "id, invoice_id, customer_id, credit_note_number, motive, reason_text, status, currency, " +
  "cfdi_status, cfdi_uuid, cfdi_pdf_url, cfdi_xml_url, cfdi_error_message, facturapi_invoice_id, " +
  "cancellation_status, cancellation_motive, cancellation_reason, cancelled_at, substitution_uuid, " +
  "line_items, subtotal, tax_rate, tax_amount, total, issued_at, created_by, created_at, updated_at";

export const creditNoteQueries = defineEntityQueries<"credit_notes", CreditNote[], never>(
  "credit_notes",
  {
    list: (filter) => async () => {
      const invoiceId = filter?.invoiceId as string | undefined;
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from("credit_notes")
        .select(CREDIT_NOTE_COLUMNS)
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false })
        .returns<CreditNote[]>();
      if (error) throw error;
      return data ?? [];
    },
  },
);

export function useCreditNotesForInvoice(invoiceId: string | undefined) {
  return useQuery({
    ...creditNoteQueries.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}
