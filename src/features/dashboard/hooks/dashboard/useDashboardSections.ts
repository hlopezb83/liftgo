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
  mapWeeklyUtilization,
  mapRevenuePerUnit,
  mapCashFlow,
  buildFinancials,
  buildAlertsProps,
  computeUtilizationPercent,
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
 * Centraliza derivaciones del dashboard. Toda la lógica de mapping pura vive
 * en `dashboardSectionHelpers` para mantener este hook declarativo.
 */
export function useDashboardSections() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: kpis } = useFinancialKpis();
  const { data: insuranceData } = useInsuranceAlerts();
  const { data: upcomingInvoices } = useUpcomingInvoices();

  const counts = useMemo(() => stats?.fleet_counts ?? EMPTY_COUNTS, [stats?.fleet_counts]);
  const activeFleet = counts.total - counts.retired - counts.sold;
  const utilizationPercent = computeUtilizationPercent(counts, activeFleet);

  const overdueInvoices = useMemo(() => stats?.overdue_invoices ?? [], [stats?.overdue_invoices]);

  return {
    isLoading,
    insuranceData,
    utilizationPercent,
    overdueInvoices,
    outstandingRevenue: stats?.invoice_stats?.outstanding_revenue ?? 0,
    statCards: useMemo(() => buildStatCards(counts, activeFleet), [counts, activeFleet]),
    pieData: useMemo(() => buildPieData(counts), [counts]),
    agingBuckets: useMemo(() => computeAgingBuckets(overdueInvoices), [overdueInvoices]),
    maintenanceAlerts: useMemo(() => mapMaintenanceAlerts(stats?.maintenance_alerts), [stats?.maintenance_alerts]),
    weeklyUtilization: useMemo(() => mapWeeklyUtilization(stats), [stats]),
    revenuePerUnit: useMemo(() => mapRevenuePerUnit(stats), [stats]),
    invoiceBreakdown: useMemo(() => mapInvoiceBreakdown(stats?.invoice_stats?.breakdown), [stats?.invoice_stats?.breakdown]),
    cashFlowData: useMemo(() => mapCashFlow(stats), [stats]),
    financials: buildFinancials(kpis),
    alertsProps: buildAlertsProps(stats, upcomingInvoices, kpis),
  };
}
