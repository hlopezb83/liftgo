import { useQuery } from "@tanstack/react-query";
import { dashboardStatsQueries } from "../lib/dashboardQueries";
import { dateKeyToday } from "../lib/queryKeys";

export function useDashboardStats() {
  const dateKey = dateKeyToday();

  return useQuery(dashboardStatsQueries.list({ dateKey }));
}

