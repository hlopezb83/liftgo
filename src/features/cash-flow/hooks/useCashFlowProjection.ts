import { useQuery } from "@tanstack/react-query";
import { cashFlowProjectionQueries, type CashFlowProjectionFilter } from "../lib/queryKeys";

interface Args {
  weeks: number;
  initialBalance: number;
  safetyBuffer: number;
}

export function useCashFlowProjection({ weeks, initialBalance, safetyBuffer }: Args) {
  const filter: CashFlowProjectionFilter = { weeks, initialBalance, safetyBuffer };
  return useQuery(cashFlowProjectionQueries.list(filter));
}
