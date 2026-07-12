import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { supplierBillQueries, type SupplierBillDetail } from "./useSupplierBills";

export type SupplierPayment = Database["public"]["Tables"]["supplier_payments"]["Row"];
export type { SupplierBillDetail } from "./useSupplierBills";

export function useSupplierBill(id: string | null | undefined) {
  return useQuery({
    ...supplierBillQueries.detail(id ?? ""),
    enabled: !!id,
  }) as ReturnType<typeof useQuery<SupplierBillDetail | null>>;
}
