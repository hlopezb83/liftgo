import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCards } from "@/components/dashboard/StatCards";
import { AlertsRow } from "@/components/dashboard/AlertsRow";
import { FleetStatusChart } from "@/components/dashboard/FleetStatusChart";
import { InvoiceBreakdown } from "@/components/dashboard/InvoiceBreakdown";
import { UtilizationCharts } from "@/components/dashboard/UtilizationCharts";
import { CashFlowChart } from "@/components/dashboard/CashFlowChart";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { formatCurrency } from "@/lib/formatCurrency";
import { Truck, CheckCircle, Clock, Wrench, Receipt } from "lucide-react";
import { useMemo } from "react";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { differenceInDays, parseISO } from "date-fns";

const STATUS_COLORS = {
  available: "hsl(142, 71%, 45%)",
  rented: "hsl(217, 91%, 60%)",
  maintenance: "hsl(38, 92%, 50%)",
  retired: "hsl(220, 10%, 55%)",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: "hsl(220, 10%, 55%)",
  sent: "hsl(217, 91%, 60%)",
  overdue: "hsl(0, 84%, 60%)",
  paid: "hsl(142, 71%, 45%)",
};

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

  const counts = stats?.fleet_counts ?? { total: 0, available: 0, rented: 0, maintenance: 0, retired: 0 };

  const pieData = useMemo(() => [
    { name: "Disponibles", value: counts.available, color: STATUS_COLORS.available },
    { name: "Rentados", value: counts.rented, color: STATUS_COLORS.rented },
    { name: "Mantenimiento", value: counts.maintenance, color: STATUS_COLORS.maintenance },
  ].filter((d) => d.value > 0), [counts]);

  const outstandingRevenue = stats?.invoice_stats?.outstanding_revenue ?? 0;

  const overdueInvoices = stats?.overdue_invoices ?? [];

  const agingBuckets = useMemo(() => {
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    overdueInvoices.forEach((inv) => {
      const days = differenceInDays(new Date(), parseISO(inv.due_date));
      if (days <= 30) buckets["0-30"] += Number(inv.total);
      else if (days <= 60) buckets["31-60"] += Number(inv.total);
      else if (days <= 90) buckets["61-90"] += Number(inv.total);
      else buckets["90+"] += Number(inv.total);
    });
    return Object.entries(buckets).map(([range, total]) => ({ range, total })).filter((b) => b.total > 0);
  }, [overdueInvoices]);

  const maintenanceAlerts = useMemo(() =>
    (stats?.maintenance_alerts ?? []).map((a) => ({
      forkliftName: a.forklift_name,
      nextDate: a.next_date,
      forkliftId: a.forklift_id,
    }))
  , [stats?.maintenance_alerts]);

  const utilizationData = useMemo(() =>
    (stats?.utilization ?? []).map((u) => ({ name: u.name, utilization: u.utilization }))
  , [stats?.utilization]);

  const revenuePerUnit = useMemo(() =>
    (stats?.utilization ?? []).filter((u) => u.revenue > 0).map((u) => ({ name: u.name, revenue: u.revenue }))
  , [stats?.utilization]);

  const invoiceBreakdown = useMemo(() =>
    (stats?.invoice_stats?.breakdown ?? []).map((b) => ({
      status: b.status,
      count: b.count,
      total: b.total,
      color: INVOICE_STATUS_COLORS[b.status] || "hsl(220, 10%, 55%)",
    }))
  , [stats?.invoice_stats?.breakdown]);

  const cashFlowData = useMemo(() =>
    (stats?.cash_flow ?? []).map((cf) => ({
      month: cf.month,
      invoiced: cf.invoiced,
      paid: cf.paid,
    }))
  , [stats?.cash_flow]);

  const statCards = useMemo(() => [
    { label: "Flota Total", value: counts.total, icon: Truck, color: "text-primary" },
    { label: "Disponibles", value: counts.available, icon: CheckCircle, color: "text-status-available" },
    { label: "Rentados", value: counts.rented, icon: Clock, color: "text-status-rented" },
    { label: "En Mantenimiento", value: counts.maintenance, icon: Wrench, color: "text-status-maintenance" },
    { label: "Pendiente", value: formatCurrency(outstandingRevenue), icon: Receipt, color: "text-primary" },
  ], [counts, outstandingRevenue]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Panel</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader title="Panel" subtitle="Vista general de la flota" />
      <StatCards cards={statCards} />
      <AlertsRow overdueInvoices={overdueInvoices} maintenanceAlerts={maintenanceAlerts} agingBuckets={agingBuckets} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FleetStatusChart data={pieData} />
        <InvoiceBreakdown data={invoiceBreakdown} outstandingRevenue={outstandingRevenue} />
      </div>
      <UtilizationCharts utilizationData={utilizationData} revenuePerUnit={revenuePerUnit} />
      <CashFlowChart data={cashFlowData} />
      <RecentActivity />
    </div>
    </PageTransition>
  );
}
