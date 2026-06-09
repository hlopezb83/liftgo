import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PaymentBatch {
  id: string;
  exported_at: string;
  total_amount: number;
  bill_count: number;
  currency: string;
  notes: string | null;
}

export const PAYMENT_BATCHES_QK = ["supplier_payment_batches"] as const;

export function usePaymentBatches() {
  return useQuery({
    queryKey: PAYMENT_BATCHES_QK,
    staleTime: 60_000,
    queryFn: async (): Promise<PaymentBatch[]> => {
      const { data, error } = await supabase
        .from("supplier_payment_batches")
        .select("id, exported_at, total_amount, bill_count, currency, notes")
        .order("exported_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        total_amount: Number(r.total_amount),
      }));
    },
  });
}
