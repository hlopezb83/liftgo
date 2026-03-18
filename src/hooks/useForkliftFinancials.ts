import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ForkliftFinancials {
  revenue: number;
  maintenance_cost: number;
  acquisition_cost: number;
  gross_margin: number;
  roi_percent: number;
  days_rented: number;
  days_since_acquired: number;
  utilization_percent: number;
  hourometer_history: Array<{
    delivery_id: string;
    delivery_number: string;
    type: string;
    date: string;
    hours_reading: number;
    booking_id: string | null;
  }>;
}

export function useForkliftFinancials(forkliftId: string | undefined) {
  return useQuery({
    queryKey: ["forklift-financials", forkliftId],
    enabled: !!forkliftId,
    queryFn: async () => {
      if (!forkliftId) throw new Error("ID requerido");
      const { data, error } = await supabase.rpc("get_forklift_financials", {
        p_forklift_id: forkliftId,
      });
      if (error) throw error;
      return data as unknown as ForkliftFinancials;
    },
    staleTime: 60_000,
  });
}
