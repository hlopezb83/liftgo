import { subMonths } from "date-fns";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageTransition } from "@/components/layout/PageTransition";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { nowMty } from "@/lib/utils";
import { AgingReport } from "../components/reports/AgingReport";
import { IncomeStatementReport } from "../components/reports/IncomeStatementReport";
import { MaintenanceCostReport } from "../components/reports/MaintenanceCostReport";
import { ProfitabilityByModelReport } from "../components/reports/ProfitabilityByModelReport";
import { RevenueReport } from "../components/reports/RevenueReport";
import { UtilizationByModelReport } from "../components/reports/UtilizationByModelReport";
import { UtilizationReport } from "../components/reports/UtilizationReport";
import type { ComponentType } from "react";
import type { DateRange } from "react-day-picker";

interface ReportProps { startDate: Date; endDate: Date }

const REPORT_COMPONENTS: Record<string, ComponentType<ReportProps>> = {
  utilization: UtilizationReport,
  "utilization-model": UtilizationByModelReport,
  revenue: RevenueReport,
  maintenance: MaintenanceCostReport,
  profitability: ProfitabilityByModelReport,
  "income-statement": IncomeStatementReport,
  aging: AgingReport,
};

const REPORT_TYPES = [
  { value: "utilization", label: "Utilización de Flota" },
  { value: "utilization-model", label: "Utilización por Modelo" },
  { value: "revenue", label: "Ingresos" },
  { value: "maintenance", label: "Costos de Mantenimiento" },
  { value: "profitability", label: "Rentabilidad por Modelo" },
  { value: "income-statement", label: "Estado de Resultados" },
  { value: "aging", label: "Antigüedad de Cartera" },
];

export default function ReportsPage() {
  // FIX-FE-12b: el tipo de reporte vive en la URL (sincronización bidireccional).
  // Antes se leía solo en mount: links a /reports?type=aging no hacían nada
  // estando ya en la página y el Select no actualizaba la URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const paramType = searchParams.get("type");
  const reportType = REPORT_TYPES.some((t) => t.value === paramType)
    ? (paramType as string)
    : "utilization";
  const setReportType = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("type", value);
      return next;
    }, { replace: true });
  };
  const [dateRange, setDateRange] = useState<DateRange>({ from: subMonths(nowMty(), 3), to: nowMty() });
  const startDate = dateRange?.from ?? subMonths(nowMty(), 3);
  const endDate = dateRange?.to ?? nowMty();

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
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DateRangePickerField label="Rango de Fechas" dateRange={dateRange} onSelect={(r) => r && setDateRange(r)} />
          </div>
        </CardContent>
      </Card>

      {(() => {
        const Comp = REPORT_COMPONENTS[reportType];
        return Comp ? <Comp startDate={startDate} endDate={endDate} /> : null;
      })()}
    </PageContainer>
    </PageTransition>
  );
}
