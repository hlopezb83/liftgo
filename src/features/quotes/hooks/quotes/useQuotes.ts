import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notifyError } from "@/lib/ui/appFeedback";
import { supabase } from "@/integrations/supabase/client";
import { callRpc } from "@/lib/rpc";
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

/** Trae una lista puntual de cotizaciones por sus IDs. Útil al facturar
 *  desde múltiples reservas para leer las partidas adicionales (logística,
 *  entrega) que quedaron capturadas en la cotización origen. */
export function useQuotesByIds(ids: string[] | undefined) {
  const key = (ids ?? []).slice().sort().join(",");
  return useQuery({
    queryKey: ["quotes", "byIds", key],
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (quote: TablesInsert<"quotes">) => {
      const { data, error } = await supabase.from("quotes").insert(quote).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quotes"] }),
    onError: (err: Error) => {
      notifyError({ title: "Error al crear cotización", error: err });
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
      notifyError({ title: "Error al actualizar cotización", error: err });
    },
  });
}

export function useDeleteQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await callRpc<void>("delete_quote_with_unassign", { p_quote_id: id });
      return id;
    },
    onSuccess: (deletedId) => {
      queryClient.setQueryData<Quote[]>(["quotes"], (old) =>
        old ? old.filter((q) => q.id !== deletedId) : []
      );
      queryClient.removeQueries({ queryKey: ["quotes", deletedId] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["forklift-options"] });
      queryClient.invalidateQueries({ queryKey: ["quote_assigned_forklifts"] });
      queryClient.invalidateQueries({ queryKey: ["status_logs"] });
    },
    onError: (err: Error) => {
      notifyError({ title: "Error al eliminar cotización", error: err });
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
