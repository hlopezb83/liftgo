import { useState } from "react";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { TrendingUp, TrendingDown, DollarSign, Percent, AlertTriangle } from "lucide-react";

import { useIncomeStatementData } from "../../hooks/useIncomeStatementData";
import { exportIncomeStatementPdf } from "@/lib/pdf/incomeStatement";

import { IncomeStatementToolbar } from "./IncomeStatementToolbar";
import { IncomeStatementTable } from "./IncomeStatementTable";

interface Props {
  startDate: Date;
  endDate: Date;
  accountingBasis?: "accrual" | "cash";
}

export function IncomeStatementReport({ startDate, endDate, accountingBasis = "accrual" }: Props) {
  const {
    filteredData, totals, statementRows, comparisonRows, yearTotals,
    csvRows, depreciationBreakdownRows, cogsBreakdownRows, rentalBreakdownRows, salesBreakdownRows,
    rentedWithoutCost,
    soldWithoutCost,
    availableYears, selectedYear, setSelectedYear, isComparison,
  } = useIncomeStatementData({ startDate, endDate, accountingBasis });


  const [pdfLoading, setPdfLoading] = useState(false);

  const netPositive = totals.netProfit >= 0;
  const marginPositive = totals.margin >= 0;
  const kpis = [
    { label: "Ingresos", value: formatCurrency(totals.revenue), icon: DollarSign, color: "text-chart-2" },
    { label: "Total Egresos", value: formatCurrency(totals.totalExpenses), icon: TrendingDown, color: "text-destructive" },
    { label: "Utilidad Neta", value: formatCurrency(totals.netProfit), icon: netPositive ? TrendingUp : TrendingDown, color: netPositive ? "text-chart-2" : "text-destructive" },
    { label: "Margen Neto", value: `${totals.margin.toFixed(1)}%`, icon: Percent, color: marginPositive ? "text-chart-2" : "text-destructive" },
  ];

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      await exportIncomeStatementPdf({
        filteredData, statementRows, comparisonRows, yearTotals,
        isComparison, selectedYear, availableYears, startDate, endDate,
      });
      notifySuccess("PDF descargado");
    } catch (err) {
      notifyError({ error: err, message: "Error al generar PDF" });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      {rentedWithoutCost.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Equipos sin costo de adquisición</AlertTitle>
          <AlertDescription>
            Los siguientes equipos rentados no tienen costo de adquisición registrado y se omiten del cálculo de depreciación:{" "}
            <span className="font-semibold">{rentedWithoutCost.map((fl) => fl.name).join(", ")}</span>.
            Actualiza el costo en la ficha del equipo para incluirlos.
          </AlertDescription>
        </Alert>
      )}

      {soldWithoutCost.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Equipos vendidos sin costo de adquisición</AlertTitle>
          <AlertDescription>
            Los siguientes equipos están marcados como vendidos pero no tienen costo de adquisición registrado, por lo que no aparecen en el Costo de Equipos Vendidos:{" "}
            <span className="font-semibold">{soldWithoutCost.map((fl) => fl.name).join(", ")}</span>.
            Actualiza el costo en la ficha del equipo.
          </AlertDescription>
        </Alert>
      )}

      {!isComparison && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${kpi.color}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground truncate">{kpi.label}</p>
                  <p className="text-lg font-bold truncate">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <IncomeStatementToolbar
        availableYears={availableYears}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        csvRows={csvRows}
        onExportPdf={handleExportPdf}
        pdfLoading={pdfLoading}
      />

      <IncomeStatementTable
        isComparison={isComparison}
        filteredData={filteredData}
        yearTotals={yearTotals}
        comparisonRows={comparisonRows}
        statementRows={statementRows}
        depreciationBreakdownRows={depreciationBreakdownRows}
        cogsBreakdownRows={cogsBreakdownRows}
        rentalBreakdownRows={rentalBreakdownRows}
        salesBreakdownRows={salesBreakdownRows}

      />
    </>
  );
}
