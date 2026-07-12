import { useQuery } from "@tanstack/react-query";
import { dateKeyToday, mrrDetailQueries } from "../lib/queryKeys";

export type { MrrItem, MrrDetail } from "../lib/queryKeys";

export function useMrrDetail() {
  const dateKey = dateKeyToday();

  return useQuery(mrrDetailQueries.list({ dateKey }));
}
