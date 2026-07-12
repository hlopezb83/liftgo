import { useQuery } from "@tanstack/react-query";
import { todayKeyMty } from "@/lib/format/dateFormats";
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
  const dateKey = todayKeyMty();

  return useQuery({
    queryKey: ["financial-kpis", dateKey],
    queryFn: () => callRpc<FinancialKpis>("get_financial_kpis"),
    staleTime: 30_000,
  });
}
