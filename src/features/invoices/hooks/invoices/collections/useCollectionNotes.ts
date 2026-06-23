import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";

import { collectionNoteKeys } from "../../../lib/queryKeys";
export function useCollectionNotes(invoiceId?: string) {
  return useQuery({
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
      return data;
    },
  });
}

export function useCreateCollectionNote() {
  const queryClient = useQueryClient();
  return useMutation({
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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: collectionNoteKeys.byInvoice(variables.invoice_id) });
      notifySuccess("Nota de cobranza registrada");
    },
    onError: (err: Error) => notifyError({ title: "Error al registrar nota", error: err }),
  });
}
