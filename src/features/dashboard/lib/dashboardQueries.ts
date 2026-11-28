import { supabase } from "@/integrations/supabase/client";
import { roundMoney } from "@/lib/money";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { operationSummaryKeys } from "@/lib/query/operationSummaryKeys";
import { callRpc } from "@/lib/rpc";
import type {
  ActivityFeedRow,
  ActivityFilters,
  DashboardStats,
  FinancialKpis,
  MrrDetail,
} from "./queryKeys";

const sel = (s: string): string => s;
const ACTIVITY_COLUMNS = sel(
  "id, actor_id, actor_name, actor_role, entity_type, entity_id, event_type, title, description, created_at, is_e2e",
);

export const mrrDetailQueries = defineEntityQueries<"dashboard-mrr-detail", MrrDetail>(
  "dashboard-mrr-detail",
  {
    list: () => async () => {
      const result = await callRpc<MrrDetail>("get_mrr_detail");
      return {
        items: result?.items ?? [],
        total_mrr: roundMoney(result?.total_mrr ?? 0),
        fx_missing_count: Number(result?.fx_missing_count ?? 0),
      };
    },
  },
);

export const financialKpisQueries = defineEntityQueries<"dashboard-financial-kpis", FinancialKpis>(
  "dashboard-financial-kpis",
  {
    list: () => () => callRpc<FinancialKpis>("get_financial_kpis"),
    staleTime: 30_000,
  },
);

export const dashboardStatsQueries = defineEntityQueries<"dashboard-stats", DashboardStats>(
  operationSummaryKeys.dashboardStats.all[0],
  {
    list: () => async () => callRpc<DashboardStats>("get_dashboard_stats"),
    staleTime: 30_000,
  },
);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function readActivityFeedFilter(filter: Readonly<Record<string, unknown>> | undefined): {
  limit: number;
  filters: ActivityFilters;
} {
  const limitRaw = filter?.limit;
  const filtersRaw = filter?.filters;
  const limit = typeof limitRaw === "number" ? limitRaw : 50;
  const filters: ActivityFilters = {};
  if (isRecord(filtersRaw)) {
    if (filtersRaw.from instanceof Date) filters.from = filtersRaw.from;
    if (filtersRaw.to instanceof Date) filters.to = filtersRaw.to;
    if (typeof filtersRaw.actorId === "string") filters.actorId = filtersRaw.actorId;
    if (typeof filtersRaw.entityType === "string") filters.entityType = filtersRaw.entityType;
    if (typeof filtersRaw.eventType === "string") filters.eventType = filtersRaw.eventType;
    if (typeof filtersRaw.search === "string") filters.search = filtersRaw.search;
  }
  return { limit, filters };
}

async function fetchActivityFeed(limit: number, filters: ActivityFilters): Promise<ActivityFeedRow[]> {
  let query = supabase
    .from("activity_feed")
    .select(ACTIVITY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit)
    .or("is_e2e.is.null,is_e2e.eq.false");

  if (filters.from) query = query.gte("created_at", filters.from.toISOString());
  if (filters.to) query = query.lte("created_at", filters.to.toISOString());
  if (filters.actorId) {
    query = filters.actorId === "system"
      ? query.is("actor_id", null)
      : query.eq("actor_id", filters.actorId);
  }
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.eventType) query = query.eq("event_type", filters.eventType);
  if (filters.search) {
    const term = filters.search.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    query = query.ilike("description", `%${term}%`);
  }

  const { data, error } = await query.returns<ActivityFeedRow[]>();
  if (error) throw error;
  return data ?? [];
}

export const activityFeedQueries = defineEntityQueries<"dashboard-activity-feed", ActivityFeedRow[]>(
  "dashboard-activity-feed",
  {
    list: (filter) => async () => {
      const { limit, filters } = readActivityFeedFilter(filter);
      return fetchActivityFeed(limit, filters);
    },
    staleTime: 60_000,
  },
);
