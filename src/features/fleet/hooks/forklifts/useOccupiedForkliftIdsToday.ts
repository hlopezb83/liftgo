import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Full server-side set of units with a confirmed reservation active today. */
export function useOccupiedForkliftIdsToday() {
  return useQuery({
    queryKey: ["fleet", "occupied-forklift-ids-today"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (
        fn: string,
      ) => Promise<{ data: Array<{ forklift_id: string }> | null; error: Error | null }>)(
        "get_occupied_forklift_ids_today",
      );
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.forklift_id));
    },
  });
}
