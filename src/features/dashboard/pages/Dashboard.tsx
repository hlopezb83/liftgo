import { PageTransition } from "@/components/layout/PageTransition";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
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
    monthlyUtilization, revenuePerUnit, cashFlowData,
    overdueInvoices,
    financials, alertsProps,
  } = useDashboardSections();

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title="Panel" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageTransition>
      <PageContainer>
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
          monthlyUtilization={monthlyUtilization}
          revenuePerUnit={revenuePerUnit}
          cashFlowData={cashFlowData}
        />
      </PageContainer>
    </PageTransition>
  );
}
