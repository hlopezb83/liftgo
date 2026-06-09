import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Bill = Database["public"]["Tables"]["supplier_bills"]["Row"];
export type SupplierPayment = Database["public"]["Tables"]["supplier_payments"]["Row"];

export interface SupplierBillDetail extends Bill {
  suppliers: { id: string; name: string; rfc: string | null } | null;
  payments: SupplierPayment[];
}

export function useSupplierBill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["supplier_bill", id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async (): Promise<SupplierBillDetail | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("supplier_bills")
        .select("*, suppliers(id, name, rfc), payments:supplier_payments(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const detail = data as unknown as SupplierBillDetail;
      detail.payments = (detail.payments ?? []).sort(
        (a, b) => b.payment_date.localeCompare(a.payment_date),
      );
      return detail;
    },
  });
}
