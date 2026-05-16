import { useState, useMemo } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityKPIs } from "@/features/audit/components/activity/ActivityKPIs";
import { ActivityByMember } from "@/features/audit/components/activity/ActivityByMember";
import { ActivityByModule } from "@/features/audit/components/activity/ActivityByModule";
import { ActivityTimeline } from "@/features/audit/components/activity/ActivityTimeline";
import { useActivityMetrics } from "@/features/audit/hooks/useActivityMetrics";
import { getRange, type RangeKey } from "@/features/audit/lib/activityConstants";
import type { ActivityFilters } from "@/features/dashboard/hooks/useActivityFeed";

export default function ActivityPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("7d");
  const range = useMemo(() => getRange(rangeKey), [rangeKey]);
  const [filters, setFilters] = useState<ActivityFilters>({});

  const { data: metrics } = useActivityMetrics({ from: range.from, to: range.to });

  const updateFilters = (next: Partial<ActivityFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));
  const resetFilters = () => setFilters({});

  const timelineFilters: ActivityFilters = {
    ...filters,
    from: range.from,
    to: range.to,
  };

  const empty = {
    totalCurrent: 0, totalPrevious: 0, uniqueActors: 0,
    topModule: null, peakHour: null,
    byMember: [], byModule: [], byHour: [],
  };
  const m = metrics ?? empty;

  return (
    <PageTransition>
      <div className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader
            title="Actividad del Equipo"
            subtitle="Qué está haciendo tu equipo en tiempo real"
          />
          <Tabs value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
            <TabsList>
              <TabsTrigger value="today">Hoy</TabsTrigger>
              <TabsTrigger value="7d">7 días</TabsTrigger>
              <TabsTrigger value="30d">30 días</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ActivityKPIs metrics={m} rangeLabel={range.label.toLowerCase()} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivityByMember
            members={m.byMember}
            selectedActorId={filters.actorId}
            onSelect={(id) => updateFilters({ actorId: id ?? "system" })}
          />
          <ActivityByModule
            modules={m.byModule}
            selected={filters.entityType}
            onSelect={(et) => updateFilters({ entityType: et === filters.entityType ? undefined : et })}
          />
        </div>

        <ActivityTimeline
          filters={timelineFilters}
          onFilterChange={updateFilters}
          onReset={resetFilters}
          members={m.byMember}
        />
      </div>
    </PageTransition>
  );
}
