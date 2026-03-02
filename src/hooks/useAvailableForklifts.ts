import { useMemo } from "react";
import { useForklifts } from "./useForklifts";
import { useBookings } from "./useBookings";
import { useMaintenanceLogs } from "./useMaintenanceLogs";
import { parseISO, areIntervalsOverlapping, isPast, differenceInDays } from "date-fns";
import type { DateRange } from "react-day-picker";

export function useAvailableForklifts(dateRange: DateRange | undefined) {
  const { data: forklifts, isLoading: forkliftsLoading } = useForklifts();
  const { data: allBookings } = useBookings();
  const { data: maintenanceLogs } = useMaintenanceLogs();

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const datesSelected = !!startDate && !!endDate;

  const maintenanceDueIds = useMemo(() => {
    if (!maintenanceLogs) return new Set<string>();
    const ids = new Set<string>();
    const seen = new Set<string>();
    maintenanceLogs.forEach((log) => {
      if (!seen.has(log.forklift_id)) {
        seen.add(log.forklift_id);
        if (
          log.next_service_date &&
          (isPast(parseISO(log.next_service_date)) ||
            differenceInDays(parseISO(log.next_service_date), new Date()) <= 3)
        ) {
          ids.add(log.forklift_id);
        }
      }
    });
    return ids;
  }, [maintenanceLogs]);

  const availableForklifts = useMemo(() => {
    if (!forklifts || !datesSelected) return [];
    return forklifts.filter((f) => {
      if ((f.status !== "available" && f.status !== "rented") || maintenanceDueIds.has(f.id)) return false;
      const hasOverlap = allBookings?.some(
        (b) =>
          b.forklift_id === f.id &&
          b.status !== "completed" &&
          areIntervalsOverlapping(
            { start: startDate!, end: endDate! },
            { start: parseISO(b.start_date), end: parseISO(b.end_date) }
          )
      );
      return !hasOverlap;
    });
  }, [forklifts, datesSelected, startDate, endDate, allBookings, maintenanceDueIds]);

  return { availableForklifts, forklifts, datesSelected, isLoading: forkliftsLoading };
}
