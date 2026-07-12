import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { toYMD } from "@/lib/date/toYMD";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import type { DateRange } from "react-day-picker";
import { forkliftKeys } from "../../lib/queryKeys";

type Forklift = Tables<"forklifts">;

export const availableForkliftsQueries = defineEntityQueries<typeof forkliftKeys.all[number], Forklift[], never>(
  "forklifts",
  {
    list: (filter) => async () => {
      const startStr = filter?.startStr as string | undefined;
      const endStr = filter?.endStr as string | undefined;
      if (!startStr || !endStr) return [];
      return await callRpc<Forklift[]>("get_available_forklifts", {
        p_start_date: startStr,
        p_end_date: endStr,
      });
    },
    staleTime: 30_000,
  },
);

export function useAvailableForklifts(dateRange: DateRange | undefined) {
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const datesSelected = !!startDate && !!endDate;

  const startStr = toYMD(startDate);
  const endStr = toYMD(endDate);

  const { data: availableForklifts = [], isLoading } = useQuery({
    ...availableForkliftsQueries.list({ available: true, startStr, endStr }),
    enabled: datesSelected,
  });

  return { availableForklifts, forklifts: availableForklifts, datesSelected, isLoading };
}
