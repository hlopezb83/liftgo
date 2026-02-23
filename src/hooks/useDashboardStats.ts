import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats");
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    staleTime: 30_000,
  });
}
