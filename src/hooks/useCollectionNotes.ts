import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCollectionNotes(invoiceId?: string) {
  return useQuery({
    queryKey: ["collection_notes", invoiceId],
    enabled: !!invoiceId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_notes" as any)
        .select("*")
        .eq("invoice_id", invoiceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateCollectionNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: { invoice_id: string; note: string; next_followup_date?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("collection_notes" as any)
        .insert({ ...note, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["collection_notes", variables.invoice_id] });
      toast.success("Nota de cobranza registrada");
    },
    onError: (err: Error) => toast.error("Error al registrar nota", { description: err.message }),
  });
}
