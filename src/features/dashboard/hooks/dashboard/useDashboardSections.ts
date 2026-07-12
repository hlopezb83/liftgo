import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { useDashboardStats } from "../useDashboardStats";
import { useFinancialKpis } from "../useFinancialKpis";
import { useInsuranceAlerts } from "@/features/fleet";
import { useUpcomingInvoices } from "@/features/invoices";
import { nowMty } from "@/lib/utils";
import {
  EMPTY_COUNTS,
  buildPieData,
  buildStatCards,
  mapMaintenanceAlerts,
  mapInvoiceBreakdown,
  mapMonthlyUtilization,
  mapRevenuePerUnit,
  mapCashFlow,
  buildFinancials,
  buildAlertsProps,
  computeUtilizationPercent,
} from "../../lib/dashboardSectionHelpers";

function bucketFor(days: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function computeAgingBuckets(
  overdueInvoices: Array<{ due_date: string; total: number | string; balance?: number | string | null }>,
) {
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of overdueInvoices) {
    const days = differenceInDays(nowMty(), parseISO(inv.due_date));
    const amount = inv.balance != null ? Number(inv.balance) : Number(inv.total);
    buckets[bucketFor(days)] += amount;
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

  // Nota: React Compiler memoiza las derivaciones puras siguientes.
  // Sólo conservamos useMemo para `counts` y `overdueInvoices` porque
  // sus identidades alimentan cascadas y queremos garantía manual.
  return {
    isLoading,
    insuranceData,
    utilizationPercent,
    overdueInvoices,
    outstandingRevenue: stats?.invoice_stats?.outstanding_revenue ?? 0,
    statCards: buildStatCards(counts, activeFleet),
    pieData: buildPieData(counts),
    agingBuckets: computeAgingBuckets(overdueInvoices),
    maintenanceAlerts: mapMaintenanceAlerts(stats?.maintenance_alerts),
    monthlyUtilization: mapMonthlyUtilization(stats),
    revenuePerUnit: mapRevenuePerUnit(stats),
    invoiceBreakdown: mapInvoiceBreakdown(stats?.invoice_stats?.breakdown),
    cashFlowData: mapCashFlow(stats),
    financials: buildFinancials(kpis),
    alertsProps: buildAlertsProps(stats, upcomingInvoices, kpis),
  };
}
