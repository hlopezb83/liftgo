import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCards } from "@/features/dashboard/components/dashboard/StatCards";
import { FinancialKpiCards } from "@/features/dashboard/components/dashboard/FinancialKpiCards";
import { DashboardAlertsSection } from "@/features/dashboard/components/dashboard/DashboardAlertsSection";
import { DashboardChartsSection } from "@/features/dashboard/components/dashboard/DashboardChartsSection";
import { RecentActivity } from "@/features/dashboard/components/dashboard/RecentActivity";
import { useDashboardSections } from "@/features/dashboard/hooks/dashboard/useDashboardSections";

export default function Dashboard() {
  const {
    isLoading, stats, kpis, insuranceData, upcomingInvoices,
    statCards, utilizationPercent,
    pieData, agingBuckets, maintenanceAlerts,
    weeklyUtilization, revenuePerUnit, invoiceBreakdown, cashFlowData,
    overdueInvoices, outstandingRevenue,
  } = useDashboardSections();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Panel</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="p-6 space-y-6">
        <PageHeader title="Panel" subtitle="Vista general de la flota" />
        <StatCards cards={statCards} />
        <FinancialKpiCards
          mrr={kpis?.mrr ?? 0}
          utilizationPercent={utilizationPercent}
          dso={kpis?.dso ?? 0}
          overdueTotal={kpis?.overdue_total ?? 0}
        />
        <DashboardAlertsSection
          overdueInvoices={overdueInvoices}
          maintenanceAlerts={maintenanceAlerts}
          agingBuckets={agingBuckets}
          overdueBookings={stats?.overdue_bookings ?? []}
          upcomingInvoices={upcomingInvoices ?? []}
          expiringContracts={kpis?.expiring_contracts ?? []}
          insuranceData={insuranceData}
        />
        <DashboardChartsSection
          pieData={pieData}
          invoiceBreakdown={invoiceBreakdown}
          outstandingRevenue={outstandingRevenue}
          weeklyUtilization={weeklyUtilization}
          revenuePerUnit={revenuePerUnit}
          cashFlowData={cashFlowData}
        />
        <RecentActivity />
      </div>
    </PageTransition>
  );
}
