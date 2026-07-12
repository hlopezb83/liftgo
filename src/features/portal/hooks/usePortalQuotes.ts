import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { portalQueries } from "../lib/queryKeys";

export function usePortalQuotes() {
  const { user } = useAuth();
  return useQuery({
    ...portalQueries.quotes.list(),
    enabled: !!user,
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
