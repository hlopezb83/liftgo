import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseAccountsPayableSummary } from "../lib/accountsPayableRpc";
import { supplierBillKeys } from "./useSupplierBills";

async function fetchSummary() {
  const { data, error } = await supabase.rpc("get_accounts_payable_summary");
  if (error) throw error;
  return parseAccountsPayableSummary(data);
}

export function useAccountsPayableSummary() {
  const query = useQuery({
    queryKey: [...supplierBillKeys.all, "accounts-payable-summary"],
    queryFn: fetchSummary,
    staleTime: 30_000,
  });

  return {
    ...query,
    kpis: query.isError ? undefined : query.data?.kpis,
    availableMonths: query.data?.availableMonths ?? [],
  };
}
