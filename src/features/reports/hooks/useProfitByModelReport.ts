import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";

export interface ProfitByModelRow {
  model: string;
  units: number;
  revenue: number;
  maintenance: number;
  damages: number;
  profit: number;
  margin: number;
}

/**
 * EC-A4: Rentabilidad por modelo calculada en el servidor vía RPC
 * `report_profit_by_model`. Reemplaza los 5 `useX()` que cargaban toda la app y
 * quedaba truncado por el límite de paginación de PostgREST.
 *
 * El RPC devuelve la agregación completa por modelo, ordenada por profit desc,
 * y no está sujeto a `.limit()` porque ya devuelve una fila por modelo (~decenas).
 */
export function useProfitByModelReport(startDate: Date, endDate: Date) {
  const start = toYMD(startDate);
  const end = toYMD(endDate);
  return useQuery({
    queryKey: ["report", "profit-by-model", start, end],
    queryFn: async (): Promise<ProfitByModelRow[]> => {
      const { data, error } = await supabase.rpc("report_profit_by_model", {
        _start: start,
        _end: end,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        model: r.model,
        units: Number(r.units),
        revenue: Number(r.revenue),
        maintenance: Number(r.maintenance),
        damages: Number(r.damages),
        profit: Number(r.profit),
        margin: Number(r.margin),
      }));
    },
  });
}
