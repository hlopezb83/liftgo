import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Quote = Tables<"quotes">;

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useQuote(id?: string) {
  return useQuery({
    queryKey: ["quotes", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quote: TablesInsert<"quotes">) => {
      const { data, error } = await supabase.from("quotes").insert(quote).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al crear cotización", description: err.message, variant: "destructive" })
      );
    },
  });
}

export function useUpdateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"quotes"> & { id: string }) => {
      const { data, error } = await supabase.from("quotes").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => {
      import("@/hooks/use-toast").then(({ toast }) =>
        toast({ title: "Error al actualizar cotización", description: err.message, variant: "destructive" })
      );
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (deletedId) => {
      // Optimistically remove from cache for instant UI update
      qc.setQueryData<Quote[]>(["quotes"], (old) =>
        old ? old.filter((q) => q.id !== deletedId) : []
      );
      qc.removeQueries({ queryKey: ["quotes", deletedId] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
    },
  });
}

export function useNextQuoteNumber() {
  return useQuery({
    queryKey: ["next_quote_number"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("next_quote_number");
      if (error) throw error;
      return data as string;
    },
  });
}
