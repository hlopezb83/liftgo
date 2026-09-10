import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { portalQueries, type PortalQuoteListRow } from "../lib/queryKeys";

export function usePortalQuotes() {
  const { user } = useAuth();
  return useQuery({
    ...portalQueries.quotes.list(),
    enabled: !!user,
  });
}

export function usePortalQuotesPage(page: number, pageSize = 25) {
  const { user } = useAuth();
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const from = (safePage - 1) * safeSize;
  return useQuery({
    queryKey: [...portalQueries.quotes.keys.lists(), user?.id, "page", safePage, safeSize] as const,
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rows: PortalQuoteListRow[]; totalCount: number }> => {
      const { data, error, count } = await supabase
        .from("quotes")
        .select("id, quote_number, status, valid_until, total, currency, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + safeSize - 1)
        .returns<PortalQuoteListRow[]>();
      if (error) throw error;
      return { rows: data ?? [], totalCount: count ?? 0 };
    },
  });
}

export function usePortalQuote(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    ...portalQueries.quotes.detail(id ?? ""),
    enabled: !!user && !!id,
  });
}

export function useAcceptPortalQuote() {
  return useEntityMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.rpc("accept_quote_from_portal", {
        p_quote_id: quoteId,
        p_ip: undefined,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [portalQueries.quotes.keys.all],
    successMsg: "Cotización aceptada",
    errorTitle: "Error al aceptar cotización",
  });
}

export function useRejectPortalQuote() {
  return useEntityMutation({
    mutationFn: async ({ quoteId, reason }: { quoteId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("reject_quote_from_portal", {
        p_quote_id: quoteId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [portalQueries.quotes.keys.all],
    successMsg: "Cotización rechazada",
    errorTitle: "Error al rechazar cotización",
  });
}
