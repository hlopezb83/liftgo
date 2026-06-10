import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { notifyError } from "@/lib/ui/appFeedback";

export function usePortalQuotes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_quotes", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePortalQuote(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["portal_quote", id, user?.id],
    enabled: !!user && !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useAcceptPortalQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.rpc("accept_quote_from_portal", {
        p_quote_id: quoteId,
        p_ip: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal_quotes"] });
      qc.invalidateQueries({ queryKey: ["portal_quote"] });
      toast.success("Cotización aceptada");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}

export function useRejectPortalQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, reason }: { quoteId: string; reason: string }) => {
      const { data, error } = await supabase.rpc("reject_quote_from_portal", {
        p_quote_id: quoteId,
        p_reason: reason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portal_quotes"] });
      qc.invalidateQueries({ queryKey: ["portal_quote"] });
      toast.success("Cotización rechazada");
    },
    onError: (e: Error) => notifyError({ error: e, message: e.message }),
  });
}
