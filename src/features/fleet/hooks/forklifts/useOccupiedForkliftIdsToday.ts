import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fleetKeys } from "../../lib/queryKeys";

/** Full server-side set of units with a confirmed reservation active today. */
export function useOccupiedForkliftIdsToday() {
  return useQuery({
    queryKey: fleetKeys.occupiedForkliftIdsToday(),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_occupied_forklift_ids_today");
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.forklift_id));
    },
  });
}
