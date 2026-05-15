import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LeaderboardPeriod = "month" | "year" | "all";

export interface LeaderboardRow {
  reporter_id: string;
  reporter_name: string;
  total_reports: number;
  accepted_reports: number;
  resolved_reports: number;
  total_points: number;
}

export function useLeaderboard(period: LeaderboardPeriod) {
  return useQuery<LeaderboardRow[]>({
    queryKey: ["feedback_leaderboard", period],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_feedback_leaderboard", { _period: period });
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });
}
