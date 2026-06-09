import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Tables"]["supplier_bills"]["Row"];

export interface SupplierBillListItem extends Row {
  suppliers: { id: string; name: string } | null;
}

export const SUPPLIER_BILLS_QK = ["supplier_bills"] as const;

export function useSupplierBills() {
  return useQuery({
    queryKey: SUPPLIER_BILLS_QK,
    staleTime: 60_000,
    queryFn: async (): Promise<SupplierBillListItem[]> => {
      const { data, error } = await supabase
        .from("supplier_bills")
        .select("*, suppliers(id, name)")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SupplierBillListItem[];
    },
  });
}
