import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { creditNoteKeys } from "@/features/invoices/lib/queryKeys";
import type { Tables } from "@/integrations/supabase/types";

export type CreditNote = Tables<"credit_notes">;

export function useCreditNotesForInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceId ? creditNoteKeys.byInvoice(invoiceId) : creditNoteKeys.all,
    enabled: !!invoiceId,
    queryFn: async (): Promise<CreditNote[]> => {
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from("credit_notes")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
