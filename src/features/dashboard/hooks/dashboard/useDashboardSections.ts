import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { Truck, CheckCircle, Clock, Wrench, ShoppingCart } from "lucide-react";
import { useDashboardStats } from "@/features/dashboard/hooks/useDashboardStats";
import { useFinancialKpis } from "@/features/dashboard/hooks/useFinancialKpis";
import { useInsuranceAlerts } from "@/features/fleet/hooks/useInsuranceAlerts";
import { useUpcomingInvoices } from "@/features/invoices/hooks/invoices/useUpcomingInvoices";
import { nowMty } from "@/lib/utils";

const STATUS_COLORS = {
  available: "hsl(var(--status-available))",
  rented: "hsl(var(--status-rented))",
  maintenance: "hsl(var(--status-maintenance))",
  retired: "hsl(var(--status-retired))",
  sold: "hsl(var(--status-sold))",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "hsl(var(--status-draft))",
  sent: "hsl(var(--status-rented))",
  overdue: "hsl(var(--status-overdue))",
  paid: "hsl(var(--status-available))",
};

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
 * Centraliza todas las derivaciones del dashboard (counts, agings, charts)
 * para que la página sea declarativa y se reduzca su complejidad ciclomática.
 */
export function useDashboardSections() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: kpis } = useFinancialKpis();
  const { data: insuranceData } = useInsuranceAlerts();
  const { data: upcomingInvoices } = useUpcomingInvoices();

  const fleetCounts = stats?.fleet_counts;
  const counts = useMemo(
    () => fleetCounts ?? { total: 0, available: 0, rented: 0, maintenance: 0, retired: 0, sold: 0 },
    [fleetCounts],
  );
  const activeFleet = counts.total - counts.retired - counts.sold;
  const utilizationPercent = activeFleet > 0 ? Math.round((counts.rented / activeFleet) * 100) : 0;

  const pieData = useMemo(() => [
    { name: "Disponibles", value: counts.available, color: STATUS_COLORS.available },
    { name: "Rentados", value: counts.rented, color: STATUS_COLORS.rented },
    { name: "Mantenimiento", value: counts.maintenance, color: STATUS_COLORS.maintenance },
    { name: "Vendidos", value: counts.sold, color: STATUS_COLORS.sold },
  ].filter((d) => d.value > 0), [counts]);

  const overdueRaw = stats?.overdue_invoices;
  const overdueInvoices = useMemo(() => overdueRaw ?? [], [overdueRaw]);
  const agingBuckets = useMemo(() => computeAgingBuckets(overdueInvoices), [overdueInvoices]);

  const maintenanceRaw = stats?.maintenance_alerts;
  const maintenanceAlerts = useMemo(() =>
    (maintenanceRaw ?? []).map((a) => ({
      forkliftName: a.forklift_name,
      nextDate: a.next_date,
      forkliftId: a.forklift_id,
    })), [maintenanceRaw]);

  const weeklyRaw = stats?.weekly_utilization;
  const weeklyUtilization = useMemo(() =>
    (weeklyRaw ?? []).map((w) => ({ week_label: w.week_label, utilization: w.utilization })),
    [weeklyRaw]);

  const utilizationRaw = stats?.utilization;
  const revenuePerUnit = useMemo(() =>
    (utilizationRaw ?? []).filter((u) => u.revenue > 0).map((u) => ({ name: u.name, revenue: u.revenue })),
    [utilizationRaw]);

  const breakdownRaw = stats?.invoice_stats?.breakdown;
  const invoiceBreakdown = useMemo(() =>
    (breakdownRaw ?? []).map((b) => ({
      status: b.status,
      count: b.count,
      total: b.total,
      color: INVOICE_STATUS_COLORS[b.status] ?? "hsl(var(--status-draft))",
    })), [breakdownRaw]);

  const cashFlowRaw = stats?.cash_flow;
  const cashFlowData = useMemo(() =>
    (cashFlowRaw ?? []).map((cf) => ({ month: cf.month, invoiced: cf.invoiced, paid: cf.paid })),
    [cashFlowRaw]);

  const statCards = useMemo(() => [
    { label: "Flota Activa", value: activeFleet, icon: Truck, color: "text-primary" },
    { label: "Disponibles", value: counts.available, icon: CheckCircle, color: "text-status-available" },
    { label: "Rentados", value: counts.rented, icon: Clock, color: "text-status-rented" },
    { label: "Mantenimiento", value: counts.maintenance, icon: Wrench, color: "text-status-maintenance" },
    { label: "Vendidos", value: counts.sold, icon: ShoppingCart, color: "text-status-sold" },
  ], [counts, activeFleet]);

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
