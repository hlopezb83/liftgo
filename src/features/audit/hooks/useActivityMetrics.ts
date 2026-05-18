import { useQuery } from "@tanstack/react-query";
import { aggregateActivity, fetchActivityRanges } from "@/features/audit/lib/activityMetricsCalculators";
import type { ActivityRange, ActivityMetrics } from "./activityMetricsTypes";

export type { ActivityRange, ActivityMetrics, MemberStat, ModuleStat, HourStat } from "./activityMetricsTypes";

export function useActivityMetrics(range: ActivityRange) {
  return useQuery({
    queryKey: ["activity_metrics", range.from.toISOString(), range.to.toISOString()],
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityMetrics> => {
      const { rows, previousCount } = await fetchActivityRanges(range);
      const { byMember, byModule, byHour } = aggregateActivity(rows);

      const uniqueActors = byMember.filter((m) => m.actorId !== null).length;
      const peakHour = byHour.length > 0
        ? byHour.reduce((max, h) => (h.total > max.total ? h : max)).hour
        : null;

      return {
        totalCurrent: rows.length,
        totalPrevious: previousCount,
        uniqueActors,
        topModule: byModule[0]?.entityType ?? null,
        peakHour,
        byMember,
        byModule,
        byHour,
      };
    },
  });
}
