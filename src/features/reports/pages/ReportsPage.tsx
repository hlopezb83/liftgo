import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageTransition } from "@/components/PageTransition";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { UtilizationReport } from "@/features/reports/components/reports/UtilizationReport";
import type { DateRange } from "react-day-picker";
import { RevenueReport } from "@/features/reports/components/reports/RevenueReport";
import { MaintenanceCostReport } from "@/features/reports/components/reports/MaintenanceCostReport";
import { ProfitabilityByModelReport } from "@/features/reports/components/reports/ProfitabilityByModelReport";
import { UtilizationByModelReport } from "@/features/reports/components/reports/UtilizationByModelReport";
import { IncomeStatementReport } from "@/features/reports/components/reports/IncomeStatementReport";
import { AgingReport } from "@/features/reports/components/reports/AgingReport";
import { subMonths } from "date-fns";
import { nowMty } from "@/lib/utils";

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
  const [searchParams] = useSearchParams();
  const initialType = REPORT_TYPES.some((t) => t.value === searchParams.get("type"))
    ? searchParams.get("type")!
    : "utilization";
  const [reportType, setReportType] = useState(initialType);
  const [dateRange, setDateRange] = useState<DateRange>({ from: subMonths(nowMty(), 3), to: nowMty() });
  const startDate = dateRange?.from ?? subMonths(nowMty(), 3);
  const endDate = dateRange?.to ?? nowMty();

  return (
    <PageTransition>
    <div className="p-6 space-y-6">
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

      {reportType === "utilization" && (
        <UtilizationReport startDate={startDate} endDate={endDate} />
      )}
      {reportType === "utilization-model" && (
        <UtilizationByModelReport startDate={startDate} endDate={endDate} />
      )}
      {reportType === "revenue" && (
        <RevenueReport startDate={startDate} endDate={endDate} />
      )}
      {reportType === "maintenance" && (
        <MaintenanceCostReport startDate={startDate} endDate={endDate} />
      )}
      {reportType === "profitability" && (
        <ProfitabilityByModelReport startDate={startDate} endDate={endDate} />
      )}
      {reportType === "income-statement" && (
        <IncomeStatementReport startDate={startDate} endDate={endDate} />
      )}
      {reportType === "aging" && (
        <AgingReport startDate={startDate} endDate={endDate} />
      )}
    </div>
    </PageTransition>
  );
}
