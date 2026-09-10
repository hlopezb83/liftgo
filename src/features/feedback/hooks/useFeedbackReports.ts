import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { feedbackHistoryKeys, feedbackLeaderboardKeys, feedbackReportKeys } from "../lib/queryKeys";
import type { FeedbackStatus } from "../lib/constants";

const sel = (s: string): string => s;

const FEEDBACK_REPORT_COLUMNS = sel(
  "id, folio, reporter_id, reporter_type, reporter_name, type, module, severity, title, description, screenshot_url, context_json, status, points_awarded, admin_notes, resolved_at, created_at, updated_at"
);

const FEEDBACK_STATUS_HISTORY_COLUMNS = sel(
  "id, report_id, from_status, to_status, changed_by, comment, changed_at"
);

export type FeedbackReport = Tables<"feedback_reports">;

export interface FeedbackReportPage {
  rows: FeedbackReport[];
  totalCount: number;
}

const MY_KEY = [...feedbackReportKeys.all, "mine"] as const;

interface FeedbackCursor {
  createdAt: string;
  id: string;
}

interface FeedbackStatusRpcPage {
  rows?: FeedbackReport[] | null;
  total_count?: number | string | null;
  has_more?: boolean | null;
  next_created_at?: string | null;
  next_id?: string | null;
}

export interface FeedbackStatusPage extends FeedbackReportPage {
  hasMore: boolean;
  nextCursor: FeedbackCursor | null;
}

/** Cursor y total independientes por columna; ninguna categoría consume otra. */
export function useFeedbackReportsByStatus(status: FeedbackStatus, pageSize = 20) {
  const safeSize = Math.min(100, Math.max(1, pageSize));
  return useInfiniteQuery({
    queryKey: [...feedbackReportKeys.all, "status", status, safeSize],
    initialPageParam: null as FeedbackCursor | null,
    queryFn: async ({ pageParam }): Promise<FeedbackStatusPage> => {
      const data = await callRpc<FeedbackStatusRpcPage>("get_feedback_reports_by_status", {
        p_status: status,
        p_limit: safeSize,
        p_before_created_at: pageParam?.createdAt ?? null,
        p_before_id: pageParam?.id ?? null,
      });
      const nextCursor = data.next_created_at && data.next_id
        ? { createdAt: data.next_created_at, id: data.next_id }
        : null;
      return {
        rows: Array.isArray(data.rows) ? data.rows : [],
        totalCount: Number(data.total_count ?? 0),
        hasMore: data.has_more === true,
        nextCursor,
      };
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined,
    staleTime: 30_000,
  });
}

/** Detalle vivo por id; sigue visible aunque el reporte cambie de columna. */
export function useFeedbackReportById(reportId: string | null) {
  return useQuery({
    queryKey: [...feedbackReportKeys.all, "detail", reportId],
    enabled: !!reportId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback_reports")
        .select(FEEDBACK_REPORT_COLUMNS)
        .eq("id", reportId ?? "")
        .maybeSingle()
        .returns<FeedbackReport>();
      if (error) throw error;
      return data;
    },
  });
}

/** Reports created by the current user. */
export function useMyFeedbackReports(page = 1, pageSize = 25) {
  const { user } = useAuth();
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const from = (safePage - 1) * safeSize;
  return useQuery({
    queryKey: [...MY_KEY, user?.id, "page", safePage, safeSize],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("feedback_reports")
        .select(FEEDBACK_REPORT_COLUMNS, { count: "exact" })
        .eq("reporter_id", user?.id ?? "")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + safeSize - 1)
        .returns<FeedbackReport[]>();
      if (error) throw error;
      return { rows: data ?? [], totalCount: count ?? 0 };
    },
  });
}

export function useMyFeedbackPointsTotal() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...MY_KEY, user?.id, "points-total"],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async () => {
      type PointsRpc = () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      const rpc = supabase.rpc as unknown as (name: string) => ReturnType<PointsRpc>;
      const { data, error } = await rpc("get_my_feedback_points_total");
      if (error) throw error;
      return Number(data ?? 0);
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
        .select(FEEDBACK_STATUS_HISTORY_COLUMNS)
        .eq("report_id", reportId ?? "")
        .order("changed_at", { ascending: true })
        .returns<Tables<"feedback_status_history">[]>();
      if (error) throw error;
      return data ?? [];
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
    invalidateKeysFn: (_data, vars) => [feedbackHistoryKeys.byFilter({ reportId: vars.reportId })],
    successMsg: "Estado actualizado",
    errorTitle: "Error al cambiar estado",
  });
}
