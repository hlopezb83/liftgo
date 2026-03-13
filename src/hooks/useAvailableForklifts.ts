import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DateRange } from "react-day-picker";

type Forklift = Tables<"forklifts">;

export function useAvailableForklifts(dateRange: DateRange | undefined) {
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const datesSelected = !!startDate && !!endDate;

  const startStr = startDate?.toISOString().slice(0, 10);
  const endStr = endDate?.toISOString().slice(0, 10);

  const { data: availableForklifts = [], isLoading } = useQuery({
    queryKey: ["available_forklifts", startStr, endStr],
    enabled: datesSelected,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_available_forklifts", {
        p_start_date: startStr!,
        p_end_date: endStr!,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Forklift[];
    },
  });

  return { availableForklifts, forklifts: availableForklifts, datesSelected, isLoading };
}
