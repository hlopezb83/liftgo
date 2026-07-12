import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { supplierBillQueries, type SupplierBillDetail } from "./useSupplierBills";

export type SupplierPayment = Database["public"]["Tables"]["supplier_payments"]["Row"];
export type { SupplierBillDetail } from "./useSupplierBills";

export function useSupplierBill(id: string | null | undefined) {
  return useQuery<SupplierBillDetail | null>({
    ...supplierBillQueries.detail(id ?? ""),
    enabled: !!id,
  });
}
