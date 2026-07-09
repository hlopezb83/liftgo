import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { callRpc } from "@/lib/rpc";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
export type { Quote } from "@/types/rental";
import type { Quote } from "@/types/rental";

export const quoteKeys = createEntityKeys("quotes");

export function useQuotes() {
  return useQuery({
    queryKey: quoteKeys.lists(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .or("is_e2e.is.null,is_e2e.eq.false")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useQuote(id?: string) {
  return useQuery({
    queryKey: id ? quoteKeys.detail(id) : quoteKeys.details(),
    enabled: !!id,
    queryFn: async () => {
      if (!id) throw new Error("Quote ID is required");
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Trae una lista puntual de cotizaciones por sus IDs. */
export function useQuotesByIds(ids: string[] | undefined) {
  const key = (ids ?? []).slice().sort().join(",");
  return useQuery({
    queryKey: quoteKeys.byFilter({ byIds: key }),
    enabled: !!ids && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      if (!ids || ids.length === 0) return [];
      const { data, error } = await supabase.from("quotes").select("id, line_items").in("id", ids);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateQuote() {
  return useEntityMutation({
    mutationFn: async (quote: TablesInsert<"quotes">) => {
      const { data, error } = await supabase.from("quotes").insert(quote).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [quoteKeys.all],
    errorTitle: "Error al crear cotización",
  });
}

export function useUpdateQuote() {
  return useEntityMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"quotes"> & { id: string }) => {
      const { data, error } = await supabase.from("quotes").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    invalidateKeys: [quoteKeys.all],
    errorTitle: "Error al actualizar cotización",
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useEntityMutation({
    mutationFn: async (id: string) => {
      await callRpc<void>("delete_quote_with_unassign", { p_quote_id: id });
      return id;
    },
    invalidateKeys: [
      quoteKeys.all,
      ["forklifts"],
      ["forklift-options"],
      ["quote_assigned_forklifts"],
      ["status_logs"],
    ],
    errorTitle: "Error al eliminar cotización",
    onSuccess: (deletedId) => {
      queryClient.setQueryData<Quote[]>(quoteKeys.lists(), (old) =>
        old ? old.filter((q) => q.id !== deletedId) : []
      );
      queryClient.removeQueries({ queryKey: quoteKeys.detail(deletedId) });
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
