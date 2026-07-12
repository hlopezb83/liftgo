import { useQuery } from "@tanstack/react-query";
import { dateKeyToday, financialKpisQueries } from "../lib/queryKeys";

export type { FinancialKpis } from "../lib/queryKeys";

export function useFinancialKpis() {
  const dateKey = dateKeyToday();

  return useQuery(financialKpisQueries.list({ dateKey }));
}
