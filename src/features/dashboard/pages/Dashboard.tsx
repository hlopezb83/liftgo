import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardAlertsSection } from "../components/dashboard/DashboardAlertsSection";
import { DashboardChartsSection } from "../components/dashboard/DashboardChartsSection";
import { FinancialKpiCards } from "../components/dashboard/FinancialKpiCards";
import { StatCards } from "../components/dashboard/StatCards";
import { useDashboardSections } from "../hooks/dashboard/useDashboardSections";

function DashboardSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
      {children}
    </p>
  );
}

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
          {/* v7.181: agrupar KPIs por área (Operación vs Finanzas) para dar jerarquía. */}
          <section className="order-2 md:order-1">
            <DashboardSectionLabel>Operación</DashboardSectionLabel>
            <StatCards cards={statCards} />
          </section>
          <section className="order-3 md:order-2 border-t border-border/60 pt-5">
            <DashboardSectionLabel>Finanzas</DashboardSectionLabel>
            <FinancialKpiCards
              mrr={financials.mrr}
              utilizationPercent={utilizationPercent}
              dso={financials.dso}
              overdueTotal={financials.overdueTotal}
            />
          </section>
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
