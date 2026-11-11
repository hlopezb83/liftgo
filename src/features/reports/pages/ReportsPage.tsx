import { parseISO, isValid, subMonths } from "date-fns";
import { lazy, Suspense, type ComponentType } from "react";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasFinancialAccess } from "@/features/users";
import { formatDateMty, toYMD } from "@/lib/format/dateFormats";
import { useSearchParams } from "@/lib/router-compat";
import { nowMty } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface ReportProps { startDate: Date; endDate: Date }

const REPORT_COMPONENTS: Record<string, ComponentType<ReportProps>> = {
  utilization: lazy(() => import("../components/reports/UtilizationReport").then((m) => ({ default: m.UtilizationReport }))),
  "utilization-model": lazy(() => import("../components/reports/UtilizationByModelReport").then((m) => ({ default: m.UtilizationByModelReport }))),
  revenue: lazy(() => import("../components/reports/RevenueReport").then((m) => ({ default: m.RevenueReport }))),
  maintenance: lazy(() => import("../components/reports/MaintenanceCostReport").then((m) => ({ default: m.MaintenanceCostReport }))),
  profitability: lazy(() => import("../components/reports/ProfitabilityByModelReport").then((m) => ({ default: m.ProfitabilityByModelReport }))),
  "income-statement": lazy(() => import("../components/reports/IncomeStatementReport").then((m) => ({ default: m.IncomeStatementReport }))),
  aging: lazy(() => import("../components/reports/AgingReport").then((m) => ({ default: m.AgingReport }))),
  "accountant-export": lazy(() => import("../components/accountantExport/AccountantExportReport").then((m) => ({ default: m.AccountantExportReport }))),
};

const OPERATIONAL_REPORT_TYPES = new Set(["utilization", "utilization-model"]);

const REPORT_TYPES = [
  { value: "utilization", label: "Días reservados por unidad" },
  { value: "utilization-model", label: "Días reservados por modelo" },
  { value: "revenue", label: "Ingresos" },
  { value: "maintenance", label: "Costos de Mantenimiento" },
  { value: "profitability", label: "Rentabilidad por Modelo" },
  { value: "income-statement", label: "Estado de Resultados" },
  { value: "aging", label: "Antigüedad de Cartera" },
  { value: "accountant-export", label: "Exportar para contador" },
];

function readReportDate(value: string | null): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = parseISO(value);
  return isValid(date) && toYMD(date) === value ? date : undefined;
}

function readReportRange(params: URLSearchParams): DateRange {
  const from = readReportDate(params.get("from"));
  const to = readReportDate(params.get("to"));
  return from && (!params.has("to") || (to && from <= to))
    ? { from, to }
    : { from: subMonths(nowMty(), 3), to: nowMty() };
}

export default function ReportsPage() {
  // FIX-FE-12b: el tipo de reporte vive en la URL (sincronización bidireccional).
  // Antes se leía solo en mount: links a /reports?type=aging no hacían nada
  // estando ya en la página y el Select no actualizaba la URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const canSeeFinancialReports = useHasFinancialAccess();
  const visibleReportTypes = REPORT_TYPES.filter((type) => canSeeFinancialReports || OPERATIONAL_REPORT_TYPES.has(type.value));
  const paramType = searchParams.get("type");
  const reportType = REPORT_TYPES.some((t) => t.value === paramType)
    ? (paramType as string)
    : "utilization";
  const isRestrictedReport = !canSeeFinancialReports && !OPERATIONAL_REPORT_TYPES.has(reportType);
  const setReportType = (value: string) => {
    if (!visibleReportTypes.some((type) => type.value === value)) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("type", value);
      return next;
    }, { replace: true });
  };
  const dateRange = readReportRange(searchParams);
  const setDateRange = (range: DateRange) => {
    const from = range.from;
    if (!from) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("from", toYMD(from));
      if (range.to) next.set("to", toYMD(range.to));
      else next.delete("to");
      return next;
    }, { replace: true, expectedPathname: "/reports" });
  };
  const startDate = dateRange?.from ?? subMonths(nowMty(), 3);
  const endDate = dateRange?.to ?? dateRange?.from ?? nowMty();
  const Report = REPORT_COMPONENTS[reportType];

  return (
    <PageTransition>
    {/* R6-FE-11b: a 402px el FAB flotante tapaba el final del contenido;
        ListPageLayout ya reserva 6rem para esto, /reports no lo usa. */}
    <PageContainer className="pb-24 sm:pb-6">
      <PageHeader title="Reportes y Análisis" subtitle="Genera reportes filtrados con exportación" />

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="space-y-1.5">
              <Select value={isRestrictedReport ? "" : reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[260px] max-w-full"><SelectValue placeholder="Selecciona un reporte operativo" /></SelectTrigger>
                <SelectContent>
                  {visibleReportTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* V27-02: «Antigüedad de Cartera» siempre calcula la cartera
                vencida a hoy; mostrar un rango que no aplica confundía.
                Usa toYMD(nowMty()) para evitar la doble conversión de zona:
                nowMty() ya aplica toZonedTime(…, America/Monterrey) y
                formatDateMty sobre un instante vuelve a aplicarla, lo que en
                navegadores con TZ distinta mostraba el día anterior. */}
            {!isRestrictedReport && reportType === "aging" ? (
              <p className="text-sm text-muted-foreground pb-2">
                Cartera vencida al día de hoy ({formatDateMty(toYMD(nowMty()))})
              </p>
            ) : (
              <DateRangePickerField label="Rango de Fechas" dateRange={dateRange} onSelect={(r) => r && setDateRange(r)} />
            )}

          </div>
        </CardContent>
      </Card>

      {isRestrictedReport ? (
        <p role="alert" className="text-sm text-muted-foreground">No tienes permiso para consultar reportes financieros. Selecciona un reporte operativo.</p>
      ) : (
        <Suspense fallback={<Skeleton className="h-64 w-full" role="status" aria-label="Cargando reporte" />}>
          <Report startDate={startDate} endDate={endDate} />
        </Suspense>
      )}
    </PageContainer>
    </PageTransition>
  );
}
