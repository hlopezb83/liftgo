import { useQuery } from "@tanstack/react-query";
import { activityMetricsQueries } from "../lib/queryKeys";
import type { ActivityRange } from "./activityMetricsTypes";

export type { ActivityRange, ActivityMetrics, MemberStat, ModuleStat, HourStat } from "./activityMetricsTypes";

export function useActivityMetrics(range: ActivityRange) {
  return useQuery(
    activityMetricsQueries.list({ from: range.from.toISOString(), to: range.to.toISOString() }),
  );
}
