import { useQuery } from "@tanstack/react-query";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import { insuranceAlertsKeys } from "../lib/queryKeys";

export interface InsuranceExpiringItem {
  id: string;
  name: string;
  insurance_expiry: string;
  insurance_provider: string | null;
  days_left: number;
}

export interface InsuranceAlertsData {
  expiring: InsuranceExpiringItem[];
  no_insurance_count: number;
}

export const insuranceAlertsQueries = defineEntityQueries<"insurance-alerts", InsuranceAlertsData, never>(
  insuranceAlertsKeys.all[0],
  {
    list: () => () => callRpc<InsuranceAlertsData>("get_insurance_alerts"),
    staleTime: 5 * 60_000,
  },
);

export function useInsuranceAlerts() {
  return useQuery(insuranceAlertsQueries.list());
}
