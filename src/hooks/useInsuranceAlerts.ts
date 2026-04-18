import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
    queryFn: async (): Promise<InsuranceAlertsData> => {
      const { data, error } = await supabase.rpc("get_insurance_alerts");
      if (error) throw error;
      return data as unknown as InsuranceAlertsData;
    },
  });
}
