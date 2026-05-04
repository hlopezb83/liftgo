import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";

export interface FinancialKpis {
  mrr: number;
  dso: number;
  overdue_total: number;
  expiring_contracts: Array<{
    id: string;
    contract_number: string;
    customer_name: string | null;
    forklift_name: string | null;
    end_date: string;
    days_remaining: number;
  }>;
}

export function useFinancialKpis() {
  return useQuery({
    queryKey: ["financial-kpis"],
    queryFn: () => callRpc<FinancialKpis>("get_financial_kpis"),
    staleTime: 30_000,
  });
}
