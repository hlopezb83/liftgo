/**
 * Query keys y contratos de queries del módulo Dashboard.
 *
 * `dashboardKeys` provee el namespace raíz para invalidaciones amplias.
 * Cada fuente de datos del tablero (MRR, KPIs financieros, stats generales,
 * feed de actividad) define su propio contrato con `defineEntityQueries`
 * porque cada una tiene una forma de dato distinta.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { roundMoney } from "@/lib/money";
import { createEntityKeys } from "@/lib/query/createEntityKeys";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { callRpc } from "@/lib/rpc";

const dashboardKeys = createEntityKeys("dashboard");

// ---------------------------------------------------------------------------
// MRR detail
// ---------------------------------------------------------------------------

export interface MrrItem {
  forklift_id: string;
  forklift_name: string;
  model: string;
  manufacturer: string | null;
  serial_number: string | null;
  monthly_rate: number;
  daily_rate: number;
  weekly_rate: number;
  customer_name: string | null;
  customer_id: string | null;
  booking_number: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface MrrDetail {
  items: MrrItem[];
  total_mrr: number;
}

export const mrrDetailQueries = defineEntityQueries<"dashboard-mrr-detail", MrrDetail>(
  "dashboard-mrr-detail",
  {
    list: () => async () => {
      const result = await callRpc<MrrDetail>("get_mrr_detail");
      return {
        items: result?.items ?? [],
        total_mrr: roundMoney(result?.total_mrr ?? 0),
      };
    },
  },
);

// ---------------------------------------------------------------------------
// Financial KPIs
// ---------------------------------------------------------------------------

export interface FinancialKpis {
  mrr: number;
  dso: number;
  overdue_total: number;
  expiring_contracts: Array<{
    id: string;
    contract_number: string;
    customer_name: string | null;
    forklift_name: string | null;
    end_date: string;
    days_remaining: number;
  }>;
}

export const financialKpisQueries = defineEntityQueries<"dashboard-financial-kpis", FinancialKpis>(
  "dashboard-financial-kpis",
  {
    list: () => () => callRpc<FinancialKpis>("get_financial_kpis"),
    staleTime: 30_000,
  },
);

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export interface DashboardStats {
  fleet_counts: {
    total: number;
    available: number;
    rented: number;
    maintenance: number;
    retired: number;
    sold: number;
  };
  invoice_stats: {
    outstanding_revenue: number;
    breakdown: Array<{ status: string; count: number; total: number }>;
  };
  overdue_invoices: Array<{
    id: string;
    invoice_number: string;
    customer_name: string | null;
    total: number;
    due_date: string;
    status: string;
    booking_id: string | null;
  }>;
  maintenance_alerts: Array<{
    forklift_name: string;
    forklift_id: string;
    next_date: string;
  }>;
  cash_flow: Array<{
    month: string;
    month_key: string;
    invoiced: number;
    paid: number;
  }>;
  utilization: Array<{
    name: string;
    utilization: number;
    revenue: number;
  }>;
  monthly_utilization: Array<{
    month_label: string;
    utilization: number;
  }>;
  overdue_bookings: Array<{
    booking_id: string;
    forklift_name: string;
    forklift_id: string;
    customer_name: string | null;
    end_date: string;
    days_overdue: number;
  }>;
  recent_activity: Array<{
    id: string;
    event_type: string;
    entity_type: string;
    entity_id: string;
    title: string;
    description: string | null;
    created_at: string;
  }>;
}

export const dashboardStatsQueries = defineEntityQueries<"dashboard-stats", DashboardStats>(
  "dashboard-stats",
  {
    list: () => () => callRpc<DashboardStats>("get_dashboard_stats"),
    staleTime: 30_000,
  },
);

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

export interface ActivityFilters {
  from?: Date;
  to?: Date;
  actorId?: string;
  entityType?: string;
  eventType?: string;
  search?: string;
}

export type ActivityFeedRow = Database["public"]["Tables"]["activity_feed"]["Row"];

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

export const activityFeedQueries = defineEntityQueries<"dashboard-activity-feed", ActivityFeedRow[]>(
  "dashboard-activity-feed",
  {
    list: (filter) => async () => {
      const { limit, filters } = readActivityFeedFilter(filter);

      let query = supabase
        .from("activity_feed")
        .select("*")
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
      if (filters.search) query = query.ilike("description", `%${filters.search}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  },
);

export function dateKeyToday(): string {
  return todayKeyMty();
}
