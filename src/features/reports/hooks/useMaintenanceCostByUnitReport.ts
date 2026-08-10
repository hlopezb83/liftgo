import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";

export interface UnitCostRow {
  [key: string]: unknown;
  name: string;
  totalCost: number;
  count: number;
}

/**
 * FIX-FE-01: costos de mantenimiento por unidad vía RPC
 * `report_maintenance_cost_by_unit`. Reemplaza useMaintenanceLogs() (501 filas)
 * que subestimaba el costo total con historiales largos.
 */
export function useMaintenanceCostByUnitReport(startDate: Date, endDate: Date) {
  const start = toYMD(startDate);
  const end = toYMD(endDate);
  return useQuery({
    queryKey: ["report", "maintenance-cost-by-unit", start, end],
    queryFn: async (): Promise<UnitCostRow[]> => {
      const { data, error } = await supabase.rpc("report_maintenance_cost_by_unit", {
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        name: r.name,
        totalCost: Number(r.total_cost),
        count: Number(r.work_count),
      }));
    },
  });
}
