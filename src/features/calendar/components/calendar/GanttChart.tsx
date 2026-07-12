import { useState } from "react";
import { parseISO, isToday } from "date-fns";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { BookingWithForklift } from "@/features/bookings";
import type { Tables } from "@/integrations/supabase/types";
import { useGanttSegments } from "../../hooks/calendar/useGanttSegments";
import { GanttHeader } from "./GanttHeader";
import { GanttRow } from "./GanttRow";
import { BOOKING_STATUS } from "@/lib/constants";


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

function ChipCloud({ groups }: { groups: Array<{ key: string; count: number }> }) {
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-2 py-3">
      {groups.map((g) => (
        <span
          key={g.key}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono bg-muted/50 border border-border rounded px-2 py-1 text-foreground/80"
        >
          {g.key}
          <span className="text-[10px] font-semibold text-muted-foreground bg-background border border-border rounded px-1">
            × {g.count}
          </span>
        </span>
      ))}
    </div>
  );
}

export function GanttChart({ forklifts, bookings, rangeStart, rangeEnd }: GanttChartProps) {
  const { days, getSegments, customerColorMap } = useGanttSegments(bookings, rangeStart, rangeEnd);
  const [legendOpen, setLegendOpen] = useState(false);

  const forkliftsWithActivity = (() => {
    const set = new Set<string>();
    bookings?.forEach((b) => {
      if (b.status !== BOOKING_STATUS.confirmed) return;
      const bStart = parseISO(b.start_date);
      const bEnd = parseISO(b.end_date);
      if (bEnd >= rangeStart && bStart <= rangeEnd) set.add(b.forklift_id);
    });
    return set;
  })();

  const { active, available, sold } = (() => {
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
  })();

  const availableGroups = groupByModel(available);
  const soldGroups = groupByModel(sold);

  // Posición de la línea vertical "hoy"
  const todayIdx = days.findIndex((d) => isToday(d));
  const todayLeftPct = todayIdx >= 0 && days.length > 0 ? ((todayIdx + 0.5) / days.length) * 100 : null;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px] relative">
        <GanttHeader days={days} />

        {active.length > 0 && <SectionHeader label="Con renta activa o futura" count={active.length} />}
        {active.map((fl) => (
          <GanttRow key={fl.id} forklift={fl} segments={getSegments(fl.id)} days={days} />
        ))}

        {available.length > 0 && <SectionHeader label="Disponibles" count={available.length} />}
        <ChipCloud groups={availableGroups} />

        {sold.length > 0 && <SectionHeader label="Vendidos" count={sold.length} />}
        <ChipCloud groups={soldGroups} />

        {/* Línea vertical de "hoy" sobre toda la grilla (sólo cubre el área de barras de renta activa) */}
        {todayLeftPct !== null && active.length > 0 && (
          <div
            className="pointer-events-none absolute top-10 flex"
            style={{ left: "12rem", right: 0, bottom: 0 }}
            aria-hidden="true"
          >
            <div
              className="absolute top-0 w-px bg-primary/70"
              style={{ left: `${todayLeftPct}%`, height: `${active.length * 36 + 32}px` }}
            />
          </div>
        )}
      </div>

      {customerColorMap.size > 0 && (
        <Collapsible open={legendOpen} onOpenChange={setLegendOpen} className="mt-4 pt-3 border-t">
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {legendOpen ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
            Leyenda de clientes ({customerColorMap.size})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-3 mt-2">
              {Array.from(customerColorMap.entries()).map(([name, color]) => (
                <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
