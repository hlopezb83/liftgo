import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

export type CreditNote = Tables<"credit_notes">;

export const creditNoteQueries = defineEntityQueries<"credit_notes", CreditNote[], never>(
  "credit_notes",
  {
    list: (filter) => async () => {
      const invoiceId = filter?.invoiceId as string | undefined;
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from("credit_notes")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
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
