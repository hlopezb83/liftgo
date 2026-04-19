import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_financial_kpis");
      if (error) throw error;
      return data as unknown as FinancialKpis;
    },
    staleTime: 30_000,
  });
}
