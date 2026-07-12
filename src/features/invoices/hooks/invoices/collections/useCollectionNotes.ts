import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { collectionNoteKeys } from "../../../lib/queryKeys";

function buildCollectionNotesQuery(invoiceId: string | undefined) {
  return queryOptions({
    queryKey: invoiceId ? collectionNoteKeys.byInvoice(invoiceId) : collectionNoteKeys.all,
    enabled: !!invoiceId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_notes")
        .select("*")
        .eq("invoice_id", invoiceId ?? "")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCollectionNotes(invoiceId?: string) {
  return useQuery(buildCollectionNotesQuery(invoiceId));
}

export function useCreateCollectionNote() {
  return useEntityMutation({
    mutationFn: async (note: { invoice_id: string; note: string; next_followup_date?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("collection_notes")
        .insert({ ...note, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [collectionNoteKeys.all],
    successMsg: "Nota de cobranza registrada",
    errorTitle: "Error al registrar nota",
  });
}
