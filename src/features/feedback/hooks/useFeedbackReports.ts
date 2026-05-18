import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import type { FeedbackStatus } from "@/features/feedback/lib/constants";

export type FeedbackReport = Tables<"feedback_reports">;

const QUERY_KEY = ["feedback_reports"] as const;
const MY_KEY = ["feedback_reports", "mine"] as const;

/** All reports — admin/administrativo/auditor only (RLS enforces). */
export function useAllFeedbackReports() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
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
    queryKey: ["feedback_history", reportId],
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
  const queryClient = useQueryClient();
  return useMutation({
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
        _comment: comment ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["feedback_reports"] });
      queryClient.invalidateQueries({ queryKey: ["feedback_leaderboard"] });
      toast.success("Estado actualizado");
    },
    onError: (err: Error) => {
      toast.error("Error al cambiar estado", { description: err.message });
    },
  });
}
