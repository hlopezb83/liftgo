import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toYMD } from "@/lib/date/toYMD";

/**
 * Fila canónica devuelta por el RPC `report_profit_by_model`. Consumida por el
 * reporte de rentabilidad, el chart y las columnas de la tabla — evita duplicar
 * el tipo y castear con `as`.
 */
export interface ModelRow {
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
 * Postgres devuelve `numeric` como string; el mapping normaliza a `number`.
 */
export function useProfitByModelReport(startDate: Date, endDate: Date) {
  const start = toYMD(startDate);
  const end = toYMD(endDate);
  return useQuery({
    queryKey: ["report", "profit-by-model", start, end],
    queryFn: async (): Promise<ModelRow[]> => {
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
