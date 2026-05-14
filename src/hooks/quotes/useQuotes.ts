import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
export type { Quote } from "@/types/rental";
import type { Quote } from "@/types/rental";

export function useQuotes() {
  return useQuery({
    queryKey: ["quotes"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
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
      if (!id) throw new Error("Quote ID is required");
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quote: TablesInsert<"quotes">) => {
      const { data, error } = await supabase.from("quotes").insert(quote).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => {
      toast.error("Error al crear cotización", { description: err.message });
    },
  });
}

export function useUpdateQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"quotes"> & { id: string }) => {
      const { data, error } = await supabase.from("quotes").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => {
      toast.error("Error al actualizar cotización", { description: err.message });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (deletedId) => {
      // Optimistically remove from cache for instant UI update
      queryClient.setQueryData<Quote[]>(["quotes"], (old) =>
        old ? old.filter((q) => q.id !== deletedId) : []
      );
      queryClient.removeQueries({ queryKey: ["quotes", deletedId] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
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
