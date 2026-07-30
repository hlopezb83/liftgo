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

export function useInsuranceAlerts(enabled = true) {
  // R6-FE-03 (N6-VEN-01): `enabled` permite gatear por rol — la RPC
  // get_insurance_alerts (20260723055853) solo admite admin/administrativo/
  // auditor/dispatcher/mechanic; sin esto ventas veía toast "Forbidden".
  return useQuery({ ...insuranceAlertsQueries.list(), enabled });
}
