import { useQuery } from "@tanstack/react-query";
import { mrrDetailQueries } from "../lib/dashboardQueries";
import { dateKeyToday } from "../lib/queryKeys";

export function useMrrDetail() {
  const dateKey = dateKeyToday();

  return useQuery(mrrDetailQueries.list({ dateKey }));
}
