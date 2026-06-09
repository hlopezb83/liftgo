import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ReconciliationStatus {
  matched_at: string;
  bank_account_name: string;
  bank_last4: string | null;
}

/**
 * Devuelve el estado de conciliación de un pago (CxC o CxP).
 * Pasa exactamente uno de paymentId / supplierPaymentId.
 */
export function useReconciliationStatus(params: {
  paymentId?: string | null;
  supplierPaymentId?: string | null;
}) {
  const { paymentId, supplierPaymentId } = params;
  const enabled = Boolean(paymentId ?? supplierPaymentId);
  const key = paymentId ? `payment:${paymentId}` : `supplier:${supplierPaymentId}`;

  return useQuery({
    queryKey: ["reconciliation_status", key],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ReconciliationStatus | null> => {
      const col = paymentId ? "matched_payment_id" : "matched_supplier_payment_id";
      const id = paymentId ?? supplierPaymentId;
      const { data, error } = await supabase
        .from("bank_statement_lines")
        .select("matched_at, bank_accounts(name, last4)")
        .eq(col, id as string)
        .eq("status", "matched")
        .order("matched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data?.matched_at) return null;
      const acct = data.bank_accounts as { name?: string; last4?: string | null } | null;
      return {
        matched_at: data.matched_at,
        bank_account_name: acct?.name ?? "Cuenta",
        bank_last4: acct?.last4 ?? null,
      };
    },
  });
}
