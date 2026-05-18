import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { useDashboardStats } from "@/features/dashboard/hooks/useDashboardStats";
import { useFinancialKpis } from "@/features/dashboard/hooks/useFinancialKpis";
import { useInsuranceAlerts } from "@/features/fleet/hooks/useInsuranceAlerts";
import { useUpcomingInvoices } from "@/features/invoices/hooks/invoices/useUpcomingInvoices";
import { nowMty } from "@/lib/utils";
import {
  EMPTY_COUNTS,
  buildPieData,
  buildStatCards,
  mapMaintenanceAlerts,
  mapInvoiceBreakdown,
} from "@/features/dashboard/lib/dashboardSectionHelpers";

function bucketFor(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function computeAgingBuckets(overdueInvoices: Array<{ due_date: string; total: number | string }>) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of overdueInvoices) {
    const days = differenceInDays(nowMty(), parseISO(inv.due_date));
    buckets[bucketFor(days)] += Number(inv.total);
  }
  return Object.entries(buckets).map(([range, total]) => ({ range, total })).filter((b) => b.total > 0);
}

/**
 * Centraliza derivaciones del dashboard (counts, agings, charts) para que la
 * página sea declarativa.
 */
export function useDashboardSections() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: kpis } = useFinancialKpis();
  const { data: insuranceData } = useInsuranceAlerts();
  const { data: upcomingInvoices } = useUpcomingInvoices();

  const counts = useMemo(() => stats?.fleet_counts ?? EMPTY_COUNTS, [stats?.fleet_counts]);
  const activeFleet = counts.total - counts.retired - counts.sold;
  const utilizationPercent = activeFleet > 0 ? Math.round((counts.rented / activeFleet) * 100) : 0;

  const pieData = useMemo(() => buildPieData(counts), [counts]);
  const statCards = useMemo(() => buildStatCards(counts, activeFleet), [counts, activeFleet]);

  const overdueInvoices = useMemo(() => stats?.overdue_invoices ?? [], [stats?.overdue_invoices]);
  const agingBuckets = useMemo(() => computeAgingBuckets(overdueInvoices), [overdueInvoices]);

  const maintenanceAlerts = useMemo(
    () => mapMaintenanceAlerts(stats?.maintenance_alerts),
    [stats?.maintenance_alerts],
  );
  const weeklyUtilization = useMemo(
    () => (stats?.weekly_utilization ?? []).map((w) => ({ week_label: w.week_label, utilization: w.utilization })),
    [stats?.weekly_utilization],
  );
  const revenuePerUnit = useMemo(
    () => (stats?.utilization ?? []).filter((u) => u.revenue > 0).map((u) => ({ name: u.name, revenue: u.revenue })),
    [stats?.utilization],
  );
  const invoiceBreakdown = useMemo(
    () => mapInvoiceBreakdown(stats?.invoice_stats?.breakdown),
    [stats?.invoice_stats?.breakdown],
  );
  const cashFlowData = useMemo(
    () => (stats?.cash_flow ?? []).map((cf) => ({ month: cf.month, invoiced: cf.invoiced, paid: cf.paid })),
    [stats?.cash_flow],
  );

  const financials = {
    mrr: kpis?.mrr ?? 0,
    dso: kpis?.dso ?? 0,
    overdueTotal: kpis?.overdue_total ?? 0,
  };

  const alertsProps = {
    overdueBookings: stats?.overdue_bookings ?? [],
    upcomingInvoices: upcomingInvoices ?? [],
    expiringContracts: kpis?.expiring_contracts ?? [],
  };

  return {
    isLoading,
    insuranceData,
    statCards,
    utilizationPercent,
    pieData, agingBuckets, maintenanceAlerts,
    weeklyUtilization, revenuePerUnit, invoiceBreakdown, cashFlowData,
    overdueInvoices,
    outstandingRevenue: stats?.invoice_stats?.outstanding_revenue ?? 0,
    financials,
    alertsProps,
  };
}
