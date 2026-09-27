import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";

/**
 * Ubicación registrada, con la misma prioridad y RLS que el listado de flota.
 * La vista descarta direcciones vacías antes de elegir contrato/movimiento.
 * No garantiza ubicación física vigente después de una devolución.
 */
export const forkliftLocationQueries = defineEntityQueries<"forklift-location", never, string | null>(
  operationSummaryKeys.forkliftLocation.all[0],
  {
    list: () => () => {
      throw new Error("forklift-location: usar detail(forkliftId)");
    },
    detail: (forkliftId: string) => async () => {
      // 10.8: propagar el error en vez de degradar a `null` — indistinguible
      // de "sin ubicación" para quien consume el hook.
      const { data, error } = await supabase
        .from("forklift_current_location" as never)
        .select("location")
        .eq("forklift_id", forkliftId)
        .limit(1)
        .maybeSingle<{ location: string | null }>();
      if (error) throw error;
      return data?.location ?? null;
    },
  },
);

export function useForkliftLocation(forkliftId: string | undefined) {
  return useQuery(forkliftLocationQueries.detail(forkliftId ?? ""));
}
