import type { BookingWithForklift } from "@/hooks/useBookings";
import type { Tables } from "@/integrations/supabase/types";
import { useGanttSegments } from "@/hooks/calendar/useGanttSegments";
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

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <GanttHeader days={days} />
        {forklifts?.map((fl) => (
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
