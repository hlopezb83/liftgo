import { useQuery } from "@tanstack/react-query";
import type { Tables } from "@/integrations/supabase/types";
import { toYMD } from "@/lib/date/toYMD";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import { forkliftKeys } from "../../lib/queryKeys";
import type { DateRange } from "react-day-picker";

type Forklift = Tables<"forklifts">;

const availableForkliftsQueries = defineEntityQueries<typeof forkliftKeys.all[number], Forklift[], never>(
  "forklifts",
  {
    list: (filter) => async () => {
      const startStr = filter?.startStr as string | undefined;
      const endStr = filter?.endStr as string | undefined;
      // `refetch()` bypasses `enabled`; keep the boundary guarded too.
      if (!startStr || !endStr || startStr > endStr) return [];
      return await callRpc<Forklift[]>("get_available_forklifts", {
        p_start_date: startStr,
        p_end_date: endStr,
      });
    },
    staleTime: 30_000,
  },
);

function availabilityDateRange(dateRange: DateRange | undefined) {
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const isValidDate = (date: Date | undefined) =>
    !date || (Number.isFinite(date.getTime()) && date.getFullYear() > 0 && date.getFullYear() <= 9999);
  const invalidDate = !isValidDate(startDate) || !isValidDate(endDate);
  // Compare calendar days, not timestamps: a same-day rental is valid even
  // when the two Date values carry different times of day.
  const startStr = !invalidDate ? toYMD(startDate)?.padStart(10, "0") : undefined;
  const endStr = !invalidDate ? toYMD(endDate)?.padStart(10, "0") : undefined;
  const invertedRange = !!startStr && !!endStr && startStr > endStr;
  const dateRangeError = invalidDate ? "Selecciona fechas válidas"
    : invertedRange ? "La fecha de fin debe ser posterior a la de inicio" : undefined;
  const datesSelected = !!startStr && !!endStr && !dateRangeError;
  return { startStr, endStr, dateRangeError, datesSelected };
}

export function useAvailableForklifts(dateRange: DateRange | undefined) {
  const { startStr, endStr, dateRangeError, datesSelected } = availabilityDateRange(dateRange);
  const { data: availableForklifts = [], isLoading, isSuccess, isError, isFetching, refetch } = useQuery({
    ...availableForkliftsQueries.list({ available: true, startStr, endStr }),
    enabled: datesSelected,
  });

  // M-16: `isSuccess` permite a los consumidores distinguir "lista vacía
  // confirmada" de "aún cargando" (con `data=[]` por defecto ambas lucen igual).
  const validatedForklifts = datesSelected ? availableForklifts : [];
  return { availableForklifts: validatedForklifts, forklifts: validatedForklifts, datesSelected, dateRangeError, isLoading, isSuccess: datesSelected && isSuccess, isError, isFetching, refetch };
}
