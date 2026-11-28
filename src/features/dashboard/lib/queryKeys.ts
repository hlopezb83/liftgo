/**
 * Query keys y tipos puros del módulo Dashboard.
 *
 * Las query definitions con I/O viven en `./dashboardQueries`.
 */
import type { Database } from "@/integrations/supabase/types";
import { todayKeyMty } from "@/lib/format/dateFormats";

interface MrrItem {
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
  /** A2-7: rentas recurrentes en divisa sin tipo de cambio, excluidas del total. */
  fx_missing_count: number;
}

export interface FinancialKpis {
  mrr: number;
  dso: number;
  overdue_total: number;
  /** N-15: facturas vencidas en divisa sin tipo de cambio, excluidas del total. */
  overdue_fx_missing_count?: number;
  /** A2-7: rentas en divisa sin tipo de cambio, excluidas del MRR vigente. */
  mrr_fx_missing_count?: number;
  /** A2-7: idem para el MRR del mes previo. */
  mrr_prev_fx_missing_count?: number;
  expiring_contracts: Array<{
    id: string;
    contract_number: string;
    customer_name: string | null;
    forklift_name: string | null;
    end_date: string;
    days_remaining: number;
  }>;
}

export interface DashboardStats {
  pending_deliveries_count: number;
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
    balance: number | null;
    balance_mxn: number | null;
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

export interface ActivityFilters {
  from?: Date;
  to?: Date;
  actorId?: string;
  entityType?: string;
  eventType?: string;
  search?: string;
}

export type ActivityFeedRow = Database["public"]["Tables"]["activity_feed"]["Row"];

export function dateKeyToday(): string {
  return todayKeyMty();
}
