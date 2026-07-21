import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardAlertsSection } from "../components/dashboard/DashboardAlertsSection";
import { DashboardChartsSection } from "../components/dashboard/DashboardChartsSection";
import { FinancialKpiCards } from "../components/dashboard/FinancialKpiCards";
import { StatCards } from "../components/dashboard/StatCards";
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
        <div className="flex flex-col gap-6">
          <div className="order-2 md:order-1">
            <StatCards cards={statCards} />
          </div>
          <div className="order-3 md:order-2">
            <FinancialKpiCards
              mrr={financials.mrr}
              utilizationPercent={utilizationPercent}
              dso={financials.dso}
              overdueTotal={financials.overdueTotal}
            />
          </div>
          <div className="order-1 md:order-3">
            <DashboardAlertsSection
              overdueInvoices={overdueInvoices}
              maintenanceAlerts={maintenanceAlerts}
              agingBuckets={agingBuckets}
              insuranceData={insuranceData}
              {...alertsProps}
            />
          </div>
          <div className="order-4">
            <DashboardChartsSection
              pieData={pieData}
              monthlyUtilization={monthlyUtilization}
              revenuePerUnit={revenuePerUnit}
              cashFlowData={cashFlowData}
            />
          </div>
        </div>
      </PageContainer>
    </PageTransition>
  );
}
