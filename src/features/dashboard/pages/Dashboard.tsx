import { QueryErrorState } from "@/components/feedback/QueryErrorState";
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
    isLoading, isError, isFetching, refetch, insuranceData,
    statCards, utilizationPercent,
    pieData, agingBuckets, maintenanceAlerts,
    monthlyUtilization, revenuePerUnit, cashFlowData,
    overdueInvoices,
    financials, alertsProps, canSeeFinancials,
  } = useDashboardSections();

  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Panel" />
        <QueryErrorState entity="el tablero" onRetry={() => refetch()} isRetrying={isFetching} />
      </PageContainer>
    );
  }

  if (isLoading) {
    // Skeleton por secciones reales: replica la jerarquía final (KPIs de
    // Operación 5 tiles, Finanzas 4 tiles, alertas y grid de gráficas) para
    // evitar saltos de contenido al hidratar. Misma convención de accesibilidad
    // que TableSkeleton: contenedor role="status" + texto sr-only.
    return (
      <PageContainer>
        <PageHeader title="Panel" />
        <div className="flex flex-col gap-6" role="status">
          <span className="sr-only">Cargando tablero…</span>
          <section className="order-2 md:order-1">
            <DashboardSectionLabel>Operación</DashboardSectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </section>
          <section className="order-3 md:order-2 border-t border-border/60 pt-5">
            <DashboardSectionLabel>Finanzas</DashboardSectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </section>
          <Skeleton className="order-1 md:order-3 h-16 rounded-xl" />
          <div className="order-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Skeleton className="h-72 rounded-xl xl:col-span-1" />
            <Skeleton className="h-72 rounded-xl xl:col-span-2" />
            <Skeleton className="h-80 rounded-xl xl:col-span-3" />
          </div>
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
          {canSeeFinancials && (
            <section className="order-3 md:order-2 border-t border-border/60 pt-5">
              <DashboardSectionLabel>Finanzas</DashboardSectionLabel>
              <FinancialKpiCards
                mrr={financials.mrr}
                utilizationPercent={utilizationPercent}
                dso={financials.dso}
                overdueTotal={financials.overdueTotal}
                overdueFxMissingCount={financials.overdueFxMissingCount}
                mrrFxMissingCount={financials.mrrFxMissingCount}

              />
            </section>
          )}
          <div className="order-1 md:order-3">
            <DashboardAlertsSection
              overdueInvoices={overdueInvoices}
              maintenanceAlerts={maintenanceAlerts}
              agingBuckets={agingBuckets}
              insuranceData={insuranceData}
              canSeeFinancials={canSeeFinancials}
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
