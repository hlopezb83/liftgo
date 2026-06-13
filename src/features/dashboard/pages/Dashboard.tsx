import { PageTransition } from "@/components/layout/PageTransition";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCards } from "../components/dashboard/StatCards";
import { FinancialKpiCards } from "../components/dashboard/FinancialKpiCards";
import { DashboardAlertsSection } from "../components/dashboard/DashboardAlertsSection";
import { DashboardChartsSection } from "../components/dashboard/DashboardChartsSection";
import { useDashboardSections } from "../hooks/dashboard/useDashboardSections";

export default function Dashboard() {
  const {
    isLoading, insuranceData,
    statCards, utilizationPercent,
    pieData, agingBuckets, maintenanceAlerts,
    weeklyUtilization, revenuePerUnit, cashFlowData,
    overdueInvoices,
    financials, alertsProps,
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
          mrr={financials.mrr}
          utilizationPercent={utilizationPercent}
          dso={financials.dso}
          overdueTotal={financials.overdueTotal}
        />
        <DashboardAlertsSection
          overdueInvoices={overdueInvoices}
          maintenanceAlerts={maintenanceAlerts}
          agingBuckets={agingBuckets}
          insuranceData={insuranceData}
          {...alertsProps}
        />
        <DashboardChartsSection
          pieData={pieData}
          weeklyUtilization={weeklyUtilization}
          revenuePerUnit={revenuePerUnit}
          cashFlowData={cashFlowData}
        />
      </div>
    </PageTransition>
  );
}
