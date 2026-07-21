import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
export type { Quote } from "@/types/rental";
import type { Quote } from "@/types/rental";

const sel = (s: string): string => s;

const QUOTE_COLUMNS = sel(
  "id, quote_number, customer_id, customer_name, forklift_id, start_date, end_date, line_items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, created_at, updated_at, quote_type, equipment_model_id, rental_meta, currency, accepted_at, accepted_ip, accepted_by_user_id, rejected_at, rejection_reason, is_e2e, e2e_scope, version"
);

const QUOTE_LIST_COLUMNS = sel(
  "id, quote_number, customer_id, customer_name, forklift_id, start_date, end_date, subtotal, tax_rate, tax_amount, total, status, valid_until, quote_type, currency"
);

type QuoteListRow = Quote;
type QuoteRow = Quote;

export const quoteQueries = defineEntityQueries<"quotes", QuoteListRow[], QuoteRow>(
  "quotes",
  {
    list: () => async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(QUOTE_LIST_COLUMNS)
        .or("is_e2e.is.null,is_e2e.eq.false")
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<QuoteListRow[]>();
      if (error) throw error;
      return data ?? [];
    },
    detail: (id: string) => async () => {
      if (!id) throw new Error("Quote ID is required");
      const { data, error } = await supabase
        .from("quotes")
        .select(QUOTE_COLUMNS)
        .eq("id", id)
        .single()
        .returns<QuoteRow>();
      if (error) throw error;
      return data;
    },
  },
);

// Alias retro-compat para consumidores existentes.
export const quoteKeys = quoteQueries.keys;

export function useQuotes() {
  return useQuery(quoteQueries.list());
}

export function useQuote(id?: string) {
  return useQuery({
    ...quoteQueries.detail(id ?? ""),
    enabled: !!id,
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
