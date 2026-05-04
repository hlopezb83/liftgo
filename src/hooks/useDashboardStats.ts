import { useQuery } from "@tanstack/react-query";
import { callRpc } from "@/lib/rpc";

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
  weekly_utilization: Array<{
    week_label: string;
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

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => callRpc<DashboardStats>("get_dashboard_stats"),
    staleTime: 30_000,
  });
}
