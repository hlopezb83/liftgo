import { useQuery } from "@tanstack/react-query";
import { dashboardStatsQueries, dateKeyToday } from "../lib/queryKeys";

export type { DashboardStats } from "../lib/queryKeys";

export function useDashboardStats() {
  const dateKey = dateKeyToday();

  return useQuery(dashboardStatsQueries.list({ dateKey }));
}
