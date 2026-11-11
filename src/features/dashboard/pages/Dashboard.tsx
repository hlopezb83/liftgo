import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoTour } from "@/features/invoices";
import { useHasModuleAccess } from "@/features/users";
import { DashboardAlertsSection } from "../components/dashboard/DashboardAlertsSection";
import { DashboardChartsSection } from "../components/dashboard/DashboardChartsSection";
import { FinancialKpiCards } from "../components/dashboard/FinancialKpiCards";
import { StatCards } from "../components/dashboard/StatCards";
import { useDashboardSections } from "../hooks/dashboard/useDashboardSections";
import { DASHBOARD_PRIORITY_LABEL, type DashboardPriority } from "../lib/dashboardPriority";

type DashboardData = ReturnType<typeof useDashboardSections>;

function SectionLabel({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{children}</h2>;
}

function DashboardLoading({ priority, canSeeFinancials, canViewFinancialCharts }: {
  priority: DashboardPriority; canSeeFinancials: boolean; canViewFinancialCharts: boolean;
}) {
  const groups = priority === "finance" ? ["finance", "operations"] : ["operations", "finance"];
  return (
    <PageContainer>
      <PageHeader title="Panel" />
      <div className="flex flex-col gap-6" role="status">
        <span className="sr-only">Cargando tablero…</span>
        <section><SectionLabel>{DASHBOARD_PRIORITY_LABEL[priority]}</SectionLabel><Skeleton className="h-24 rounded-xl" /></section>
        {groups.map((group) => group === "finance" ? canSeeFinancials && (
          <section key={group}>
            <SectionLabel>Finanzas</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </section>
        ) : (
          <section key={group}>
            <SectionLabel>Operación</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          </section>
        ))}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Skeleton className="h-72 rounded-xl xl:col-span-1" /><Skeleton className="h-72 rounded-xl xl:col-span-2" />
          {canViewFinancialCharts && <Skeleton className="h-80 rounded-xl xl:col-span-3" />}
        </div>
      </div>
    </PageContainer>
  );
}

function FinancialSection({ data }: { data: DashboardData }) {
  if (!data.canSeeFinancials) return null;
  return (
    <section aria-label="Indicadores financieros">
      <SectionLabel>Finanzas</SectionLabel>
      {data.financialsState === "error" ? (
        <QueryErrorState bare entity="los KPIs financieros" onRetry={() => { void data.refetchFinancials(); }} isRetrying={data.financialsIsFetching} />
      ) : data.financialsState === "loading" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 gap-4" role="status">
          <span className="sr-only">Cargando KPIs financieros…</span>
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <FinancialKpiCards mrr={data.financials.mrr} utilizationPercent={data.utilizationPercent}
          dso={data.financials.dso} overdueTotal={data.financials.overdueTotal}
          overdueFxMissingCount={data.financials.overdueFxMissingCount} mrrFxMissingCount={data.financials.mrrFxMissingCount} />
      )}
    </section>
  );
}

function OperationalSection({ cards }: { cards: DashboardData["statCards"] }) {
  return <section aria-label="Indicadores de operación"><SectionLabel>Operación</SectionLabel><StatCards cards={cards} /></section>;
}

export default function Dashboard() {
  const canManageInvoices = useHasModuleAccess("Facturas", "full");
  const canManageReturns = useHasModuleAccess("Entregas", "full");
  const canManageMaintenance = useHasModuleAccess("Mantenimiento", "full");
  const data = useDashboardSections();
  const priority = data.priority ?? "overview";

  if (data.isError) return (
    <PageContainer><PageHeader title="Panel" /><QueryErrorState entity="el tablero" onRetry={() => data.refetch()} isRetrying={data.isFetching} /></PageContainer>
  );
  if (data.isLoading) return <DashboardLoading priority={priority} canSeeFinancials={data.canSeeFinancials} canViewFinancialCharts={data.canViewFinancialCharts} />;

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader title="Panel" subtitle="Vista general de la flota" actions={<DemoTour />} />
        <div className="flex flex-col gap-6">
          <section aria-labelledby="dashboard-pending-title">
            <SectionLabel id="dashboard-pending-title">{DASHBOARD_PRIORITY_LABEL[priority]}</SectionLabel>
            <DashboardAlertsSection priority={priority} overdueInvoices={data.overdueInvoices}
              maintenanceAlerts={data.maintenanceAlerts} agingBuckets={data.agingBuckets}
              insuranceAlert={data.insuranceAlert} collectionForecast={data.collectionForecast}
              pendingDeliveriesCount={data.pendingDeliveriesCount} canManageInvoices={canManageInvoices}
              canManageReturns={canManageReturns} canManageMaintenance={canManageMaintenance} {...data.alertsProps} />
          </section>
          {priority === "finance" ? <><FinancialSection data={data} /><OperationalSection cards={data.statCards} /></>
            : <><OperationalSection cards={data.statCards} /><FinancialSection data={data} /></>}
          <DashboardChartsSection pieData={data.pieData} monthlyUtilization={data.monthlyUtilization}
            revenuePerUnit={data.revenuePerUnit} cashFlowData={data.cashFlowData} canSeeFinancials={data.canViewFinancialCharts} />
        </div>
      </PageContainer>
    </PageTransition>
  );
}
