import { useQuery } from "@tanstack/react-query";
import { activityFeedQueries, type ActivityFilters } from "../lib/queryKeys";

export type { ActivityFilters } from "../lib/queryKeys";

export function useActivityFeed(limit = 50, filters: ActivityFilters = {}) {
  return useQuery(activityFeedQueries.list({ limit, filters }));
}
