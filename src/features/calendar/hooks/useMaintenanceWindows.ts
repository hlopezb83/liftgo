import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { isE2eDataVisible } from "@/lib/supabase/constants";
import type { MaintenanceWindow } from "../components/calendar/GanttCard";

/** Maintenance blockers for the visible range, queried under the caller's RLS. */
export function useMaintenanceWindows(rangeStart: Date, rangeEnd: Date) {
  const start = format(rangeStart, "yyyy-MM-dd");
  const end = format(rangeEnd, "yyyy-MM-dd");
  const includeE2e = isE2eDataVisible();
  return useQuery({
    queryKey: ["calendar-maintenance-windows", start, end, includeE2e],
    queryFn: async (): Promise<MaintenanceWindow[]> => {
      const { data, error } = await supabase.rpc("get_calendar_maintenance_windows", {
        _start: start,
        _end: end,
        _include_e2e: includeE2e,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}
