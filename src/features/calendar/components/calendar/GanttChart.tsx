import { useMemo } from "react";
import { parseISO } from "date-fns";
import type { BookingWithForklift } from "@/features/bookings/hooks/useBookings";
import type { Tables } from "@/integrations/supabase/types";
import { useGanttSegments } from "@/features/calendar/hooks/calendar/useGanttSegments";
import { GanttHeader } from "./GanttHeader";
import { GanttRow } from "./GanttRow";
import { GanttGroupedRow } from "./GanttGroupedRow";

interface GanttChartProps {
  forklifts: Tables<"forklifts">[] | undefined;
  bookings: BookingWithForklift[] | undefined;
  rangeStart: Date;
  rangeEnd: Date;
}

type Forklift = Tables<"forklifts">;

function groupByModel(items: Forklift[]): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const f of items) {
    const key = `${f.manufacturer ?? ""} ${f.model}`.trim() || "Sin modelo";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-2 py-1.5 mt-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40 border-y">
      {label} ({count})
    </div>
  );
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

  const { active, available, sold } = useMemo(() => {
    const sorted = [...(forklifts ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const activeList: Forklift[] = [];
    const availableList: Forklift[] = [];
    const soldList: Forklift[] = [];
    for (const f of sorted) {
      if (forkliftsWithActivity.has(f.id)) activeList.push(f);
      else if (f.status === "sold") soldList.push(f);
      else availableList.push(f);
    }
    return { active: activeList, available: availableList, sold: soldList };
  }, [forklifts, forkliftsWithActivity]);

  const availableGroups = useMemo(() => groupByModel(available), [available]);
  const soldGroups = useMemo(() => groupByModel(sold), [sold]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <GanttHeader days={days} />

        {active.length > 0 && <SectionHeader label="Con renta activa o futura" count={active.length} />}
        {active.map((fl) => (
          <GanttRow key={fl.id} forklift={fl} segments={getSegments(fl.id)} days={days} />
        ))}

        {available.length > 0 && <SectionHeader label="Disponibles" count={available.length} />}
        {availableGroups.map((g) => (
          <GanttGroupedRow key={`avail-${g.key}`} label={g.key} count={g.count} days={days} />
        ))}

        {sold.length > 0 && <SectionHeader label="Vendidos" count={sold.length} />}
        {soldGroups.map((g) => (
          <GanttGroupedRow key={`sold-${g.key}`} label={g.key} count={g.count} days={days} />
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
