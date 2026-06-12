import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function fetchIntents(invoiceId: string | undefined) {
  const { data, error } = await supabase
    .from("customer_payment_intents")
    .select("*")
    .eq("invoice_id", invoiceId ?? "")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function usePortalPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["portal_payment_intents", invoiceId],
    enabled: !!invoiceId,
    staleTime: 30_000,
    queryFn: () => fetchIntents(invoiceId),
  });
}

export function useAdminPaymentIntents(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["admin_payment_intents", invoiceId],
    enabled: !!invoiceId,
    staleTime: 30_000,
    queryFn: () => fetchIntents(invoiceId),
  });
}
