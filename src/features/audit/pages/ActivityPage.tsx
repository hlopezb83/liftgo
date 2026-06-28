import { useState, useMemo } from "react";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityKPIs } from "../components/activity/ActivityKPIs";
import { ActivityByMember } from "../components/activity/ActivityByMember";
import { ActivityByModule } from "../components/activity/ActivityByModule";
import { ActivityTimeline } from "../components/activity/ActivityTimeline";
import { useActivityMetrics } from "../hooks/useActivityMetrics";
import { getRange, type RangeKey } from "../lib/activityConstants";
import type { ActivityFilters } from "@/features/dashboard";
import type { ActivityMetrics } from "../hooks/activityMetricsTypes";

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

  const empty: ActivityMetrics = {
    totalCurrent: 0, totalPrevious: 0, uniqueActors: 0,
    topModule: null, peakHour: null,
    byMember: [], byModule: [], byHour: [],
  };
  const m = metrics ?? empty;

  return (
    <PageTransition>
      <PageContainer className="space-y-4">
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
      </PageContainer>
    </PageTransition>
  );
}
