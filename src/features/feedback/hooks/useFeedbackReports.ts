import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import type { FeedbackStatus } from "../lib/constants";
import { feedbackHistoryKeys, feedbackLeaderboardKeys, feedbackReportKeys } from "../lib/queryKeys";

export type FeedbackReport = Tables<"feedback_reports">;

const MY_KEY = [...feedbackReportKeys.all, "mine"] as const;

export const feedbackReportQueries = defineEntityQueries<
  typeof feedbackReportKeys.all[number],
  FeedbackReport[],
  never
>("feedback_reports", {
  list: () => async () => {
    const { data, error } = await supabase
      .from("feedback_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data;
  },
  staleTime: 30_000,
});

/** All reports — admin/administrativo/auditor only (RLS enforces). */
export function useAllFeedbackReports() {
  return useQuery(feedbackReportQueries.list());
}

/** Reports created by the current user. */
export function useMyFeedbackReports() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...MY_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_reports")
        .select("*")
        .eq("reporter_id", user?.id ?? "")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useFeedbackHistory(reportId: string | null) {
  return useQuery({
    queryKey: feedbackHistoryKeys.byFilter({ reportId }),
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_status_history")
        .select("*")
        .eq("report_id", reportId ?? "")
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateFeedbackStatus() {
  return useEntityMutation({
    mutationFn: async ({
      reportId,
      newStatus,
      comment,
    }: {
      reportId: string;
      newStatus: FeedbackStatus;
      comment?: string;
    }) => {
      const { data, error } = await supabase.rpc("change_feedback_status", {
        _report_id: reportId,
        _new_status: newStatus,
        _comment: comment ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [feedbackReportKeys.all, feedbackLeaderboardKeys.all],
    successMsg: "Estado actualizado",
    errorTitle: "Error al cambiar estado",
  });
}
