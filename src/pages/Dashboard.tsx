import { useForklifts, useBookings, useInvoices, useMaintenanceLogs } from "@/hooks/useForkliftData";
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
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { format, parseISO, startOfMonth, differenceInDays, isPast } from "date-fns";
import { useMemo } from "react";

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
  const { data: forklifts, isLoading } = useForklifts();
  const { data: bookings } = useBookings();
  const { data: invoices } = useInvoices();
  const { data: maintenanceLogs } = useMaintenanceLogs();
  const navigate = useNavigate();

  const counts = useMemo(() => ({
    total: forklifts?.length || 0,
    available: forklifts?.filter((f) => f.status === "available").length || 0,
    rented: forklifts?.filter((f) => f.status === "rented").length || 0,
    maintenance: forklifts?.filter((f) => f.status === "maintenance").length || 0,
  }), [forklifts]);

  const pieData = useMemo(() => [
    { name: "Available", value: counts.available, color: STATUS_COLORS.available },
    { name: "Rented", value: counts.rented, color: STATUS_COLORS.rented },
    { name: "Maintenance", value: counts.maintenance, color: STATUS_COLORS.maintenance },
  ].filter((d) => d.value > 0), [counts]);

  const outstandingRevenue = useMemo(() =>
    invoices?.filter((i) => i.status !== "paid").reduce((sum, i) => sum + Number(i.total), 0) || 0
  , [invoices]);

  const overdueInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter(
      (i) => (i.status === "sent" || i.status === "overdue") && i.due_date && isPast(parseISO(i.due_date))
    ).map((i) => ({ ...i, booking_id: i.booking_id }));
  }, [invoices]);

  const agingBuckets = useMemo(() => {
    const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    overdueInvoices.forEach((inv) => {
      const days = differenceInDays(new Date(), parseISO(inv.due_date!));
      if (days <= 30) buckets["0-30"] += Number(inv.total);
      else if (days <= 60) buckets["31-60"] += Number(inv.total);
      else if (days <= 90) buckets["61-90"] += Number(inv.total);
      else buckets["90+"] += Number(inv.total);
    });
    return Object.entries(buckets).map(([range, total]) => ({ range, total })).filter((b) => b.total > 0);
  }, [overdueInvoices]);

  const maintenanceAlerts = useMemo(() => {
    if (!maintenanceLogs || !forklifts) return [];
    const alerts: { forkliftName: string; nextDate: string; forkliftId: string }[] = [];
    const seen = new Set<string>();
    maintenanceLogs.forEach((log) => {
      if (log.next_service_date && !seen.has(log.forklift_id)) {
        seen.add(log.forklift_id);
        if (isPast(parseISO(log.next_service_date)) || differenceInDays(parseISO(log.next_service_date), new Date()) <= 7) {
          const fl = forklifts.find((f) => f.id === log.forklift_id);
          if (fl) alerts.push({ forkliftName: fl.name, nextDate: log.next_service_date, forkliftId: fl.id });
        }
      }
    });
    return alerts;
  }, [maintenanceLogs, forklifts]);

  const utilizationData = useMemo(() => {
    if (!forklifts || !bookings) return [];
    const now = new Date();
    return forklifts.slice(0, 10).map((fl) => {
      const flBookings = bookings.filter((b) => b.forklift_id === fl.id);
      const totalDaysBooked = flBookings.reduce((sum, b) => {
        const days = differenceInDays(parseISO(b.end_date), parseISO(b.start_date)) + 1;
        return sum + Math.max(days, 0);
      }, 0);
      const daysSinceCreated = Math.max(differenceInDays(now, parseISO(fl.created_at)), 1);
      const utilization = Math.min(Math.round((totalDaysBooked / daysSinceCreated) * 100), 100);
      return { name: fl.name, utilization };
    });
  }, [forklifts, bookings]);

  const revenuePerUnit = useMemo(() => {
    if (!forklifts || !invoices || !bookings) return [];
    return forklifts.slice(0, 10).map((fl) => {
      const flBookingIds = new Set(bookings.filter((b) => b.forklift_id === fl.id).map((b) => b.id));
      const revenue = invoices
        .filter((i) => i.booking_id && flBookingIds.has(i.booking_id) && i.status === "paid")
        .reduce((sum, i) => sum + Number(i.total), 0);
      return { name: fl.name, revenue };
    }).filter((r) => r.revenue > 0);
  }, [forklifts, invoices, bookings]);

  const invoiceBreakdown = useMemo(() => {
    if (!invoices) return [];
    const groups: Record<string, { count: number; total: number }> = {};
    invoices.forEach((inv) => {
      if (!groups[inv.status]) groups[inv.status] = { count: 0, total: 0 };
      groups[inv.status].count++;
      groups[inv.status].total += Number(inv.total);
    });
    return Object.entries(groups).map(([status, data]) => ({
      status,
      ...data,
      color: INVOICE_STATUS_COLORS[status] || "hsl(220, 10%, 55%)",
    }));
  }, [invoices]);

  const cashFlowData = useMemo(() => {
    if (!invoices || invoices.length === 0) return [];
    const months: Record<string, { month: string; invoiced: number; paid: number }> = {};
    invoices.forEach((inv) => {
      const monthKey = format(startOfMonth(parseISO(inv.issued_at)), "yyyy-MM");
      const monthLabel = format(startOfMonth(parseISO(inv.issued_at)), "MMM yyyy");
      if (!months[monthKey]) months[monthKey] = { month: monthLabel, invoiced: 0, paid: 0 };
      months[monthKey].invoiced += Number(inv.total);
    });
    invoices.filter((inv) => inv.paid_at).forEach((inv) => {
      const monthKey = format(startOfMonth(parseISO(inv.paid_at!)), "yyyy-MM");
      const monthLabel = format(startOfMonth(parseISO(inv.paid_at!)), "MMM yyyy");
      if (!months[monthKey]) months[monthKey] = { month: monthLabel, invoiced: 0, paid: 0 };
      months[monthKey].paid += Number(inv.total);
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([, data]) => data);
  }, [invoices]);

  const statCards = useMemo(() => [
    { label: "Total Fleet", value: counts.total, icon: Truck, color: "text-primary" },
    { label: "Available", value: counts.available, icon: CheckCircle, color: "text-status-available" },
    { label: "Rented", value: counts.rented, icon: Clock, color: "text-status-rented" },
    { label: "In Maintenance", value: counts.maintenance, icon: Wrench, color: "text-status-maintenance" },
    { label: "Outstanding", value: formatCurrency(outstandingRevenue), icon: Receipt, color: "text-primary" },
  ], [counts, outstandingRevenue]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Fleet overview at a glance"
        action={<Button onClick={() => navigate("/fleet/new")} size="sm">Add Forklift</Button>}
      />

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
