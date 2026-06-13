import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageTransition } from "@/components/layout/PageTransition";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { UtilizationReport } from "../components/reports/UtilizationReport";
import type { DateRange } from "react-day-picker";
import { RevenueReport } from "../components/reports/RevenueReport";
import { MaintenanceCostReport } from "../components/reports/MaintenanceCostReport";
import { ProfitabilityByModelReport } from "../components/reports/ProfitabilityByModelReport";
import { UtilizationByModelReport } from "../components/reports/UtilizationByModelReport";
import { IncomeStatementReport } from "../components/reports/IncomeStatementReport";
import { AgingReport } from "../components/reports/AgingReport";
import { subMonths } from "date-fns";
import { nowMty } from "@/lib/utils";

import type { ComponentType } from "react";

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
  const [searchParams] = useSearchParams();
  const initialType = REPORT_TYPES.some((t) => t.value === searchParams.get("type"))
    ? (searchParams.get("type") ?? "utilization")
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

      {(() => {
        const Comp = REPORT_COMPONENTS[reportType];
        return Comp ? <Comp startDate={startDate} endDate={endDate} /> : null;
      })()}
    </div>
    </PageTransition>
  );
}
