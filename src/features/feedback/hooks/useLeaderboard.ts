import { useQuery } from "@tanstack/react-query";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";
import { feedbackLeaderboardKeys } from "../lib/queryKeys";

export type LeaderboardPeriod = "month" | "year" | "all";

export interface LeaderboardRow {
  reporter_id: string;
  reporter_name: string;
  total_reports: number;
  accepted_reports: number;
  resolved_reports: number;
  total_points: number;
}

export const leaderboardQueries = defineEntityQueries<
  typeof feedbackLeaderboardKeys.all[number],
  LeaderboardRow[],
  never
>("feedback_leaderboard", {
  list: (filter) => async () => {
    const period = (filter?.period as LeaderboardPeriod | undefined) ?? "all";
    const data = await callRpc<LeaderboardRow[] | null>("get_feedback_leaderboard", { _period: period });
    return data ?? [];
  },
  staleTime: 60_000,
});

export function useLeaderboard(period: LeaderboardPeriod) {
  return useQuery(leaderboardQueries.list({ period }));
}
