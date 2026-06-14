import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Versión liviana de `useForklifts` para dropdowns y selectores.
 * Solo proyecta las columnas necesarias (5 vs. 24) y evita descargar
 * JSONB pesado de `forklifts`. Cachea 5min porque el catálogo cambia poco.
 *
 * Úsalo en lugar de `useForklifts()` cuando solo necesites id/nombre/modelo
 * para renderizar selects. Para detalle/edición completa usa `useForklift(id)`.
 */
export interface ForkliftOption {
  id: string;
  name: string;
  model: string | null;
  status: string;
  capacity_kg: number | null;
}

export const FORKLIFT_OPTIONS_QK = ["forklift-options"] as const;

export function useForkliftOptions() {
  return useQuery({
    queryKey: FORKLIFT_OPTIONS_QK,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ForkliftOption[]> => {
      const { data, error } = await supabase
        .from("forklifts")
        .select("id, name, model, status, capacity_kg")
        .or("is_e2e.is.null,is_e2e.eq.false")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ForkliftOption[];
    },
  });
}
