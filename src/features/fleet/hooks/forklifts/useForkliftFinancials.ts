import { useQuery } from "@tanstack/react-query";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

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

export const forkliftFinancialsQueries = defineEntityQueries<"forklift-financials", never, ForkliftFinancials>(
  "forklift-financials",
  {
    list: () => () => {
      throw new Error("forklift-financials: usar detail(forkliftId)");
    },
    detail: (forkliftId: string) => () =>
      callRpc<ForkliftFinancials>("get_forklift_financials", { p_forklift_id: forkliftId }),
    staleTime: 60_000,
  },
);

export function useForkliftFinancials(forkliftId: string | undefined) {
  return useQuery(forkliftFinancialsQueries.detail(forkliftId ?? ""));
}
