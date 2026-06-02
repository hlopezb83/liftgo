import { useMemo } from "react";
import { parseISO } from "date-fns";
import type { BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import type { Tables } from "@/integrations/supabase/types";
import { useGanttSegments } from "@/features/calendar/hooks/calendar/useGanttSegments";
import { GanttHeader } from "./GanttHeader";
import { GanttRow } from "./GanttRow";

interface GanttChartProps {
  forklifts: Tables<"forklifts">[] | undefined;
  bookings: BookingWithForklift[] | undefined;
  rangeStart: Date;
  rangeEnd: Date;
}

export function GanttChart({ forklifts, bookings, rangeStart, rangeEnd }: GanttChartProps) {
  const { days, getSegments, customerColorMap } = useGanttSegments(bookings, rangeStart, rangeEnd);

  const forkliftsWithActivity = useMemo(() => {
    const set = new Set<string>();
    bookings?.forEach((b) => {
      if (b.status !== "confirmed") return;
      const bStart = parseISO(b.start_date);
      const bEnd = parseISO(b.end_date);
      if (bEnd >= rangeStart && bStart <= rangeEnd) set.add(b.forklift_id);
    });
    return set;
  }, [bookings, rangeStart, rangeEnd]);

  const { active, available } = useMemo(() => {
    const sorted = [...(forklifts ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    return {
      active: sorted.filter((f) => forkliftsWithActivity.has(f.id)),
      available: sorted.filter((f) => !forkliftsWithActivity.has(f.id)),
    };
  }, [forklifts, forkliftsWithActivity]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <GanttHeader days={days} />

        {active.length > 0 && (
          <div className="px-2 py-1.5 mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-y">
            Con renta activa o futura ({active.length})
          </div>
        )}
        {active.map((fl) => (
          <GanttRow key={fl.id} forklift={fl} segments={getSegments(fl.id)} days={days} />
        ))}

        {available.length > 0 && (
          <div className="px-2 py-1.5 mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-y">
            Disponibles ({available.length})
          </div>
        )}
        {available.map((fl) => (
          <GanttRow key={fl.id} forklift={fl} segments={getSegments(fl.id)} days={days} />
        ))}
      </div>

      {customerColorMap.size > 0 && (
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
          {Array.from(customerColorMap.entries()).map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
