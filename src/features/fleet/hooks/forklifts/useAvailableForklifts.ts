import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { toYMD } from "@/lib/date/toYMD";
import { callRpc } from "@/lib/rpc";
import type { DateRange } from "react-day-picker";

type Forklift = Tables<"forklifts">;

export function useAvailableForklifts(dateRange: DateRange | undefined) {
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const datesSelected = !!startDate && !!endDate;

  const startStr = toYMD(startDate);
  const endStr = toYMD(endDate);


  const { data: availableForklifts = [], isLoading } = useQuery({
    queryKey: ["available_forklifts", startStr, endStr],
    enabled: datesSelected,
    staleTime: 30_000,
    queryFn: async () => {
      if (!startStr || !endStr) return [];
      return await callRpc<Forklift[]>("get_available_forklifts", {
        p_start_date: startStr,
        p_end_date: endStr,
      });
    },
  });

  return { availableForklifts, forklifts: availableForklifts, datesSelected, isLoading };
}
