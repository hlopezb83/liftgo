import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";

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

export function useInsuranceAlerts() {
  return useQuery({
    queryKey: ["insurance-alerts"],
    staleTime: 5 * 60_000,
    queryFn: () => callRpc<InsuranceAlertsData>("get_insurance_alerts"),
  });
}
