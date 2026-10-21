import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { TrendingUpIcon, TrendingDownIcon, RevenueIcon, Percent, WarnIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { toYMD } from "@/lib/format/dateFormats";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { DEPRECIATION_ROUNDING_LABEL } from "../../hooks/incomeStatement/depreciationPresentation";
import { useStatementExports } from "../../hooks/incomeStatement/useStatementExports";
import { useIncomeStatementData } from "../../hooks/useIncomeStatementData";
import { IncomeStatementBasisNote } from "./incomeStatement/IncomeStatementBasisNote";
import { IncomeStatementTable } from "./IncomeStatementTable";
import { IncomeStatementToolbar } from "./IncomeStatementToolbar";

interface Props {
  startDate: Date;
  endDate: Date;
  accountingBasis?: "accrual" | "cash";
}

/** 2A-1: aviso de documentos en divisa excluidos por falta de tipo de cambio. */
function FxMissingAlert({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Alert variant="warning">
      <WarnIcon className="h-4 w-4" />
      <AlertTitle>Documentos o cobros sin conversión válida</AlertTitle>
      <AlertDescription>
        {count} registro{count === 1 ? "" : "s"} de facturas, proveedores o cobros sin tipo de cambio
        {count === 1 ? " se excluyó" : " se excluyeron"} de este reporte. Revisa la moneda y el tipo de cambio
        del documento o cobro correspondiente para incluirlos.
      </AlertDescription>
    </Alert>
  );
}

function formatMarginKpi(margin: number | null) {
  return {
    value: margin === null ? "No aplica" : `${margin.toFixed(1)}%`,
    color: margin === null ? "text-muted-foreground" : margin >= 0 ? "text-chart-2" : "text-destructive",
  };
}

function DepreciationRoundingNote({ isComparison, statementRows, comparisonRows }: {
  isComparison: boolean;
  statementRows: { label: string }[];
  comparisonRows: { label: string }[];
}) {
  const rows = isComparison ? comparisonRows : statementRows;
  if (!rows.some((row) => row.label === DEPRECIATION_ROUNDING_LABEL)) return null;
  return (
    <p className="text-xs text-muted-foreground">
      El ajuste de redondeo concilia los componentes mostrados con la depreciación total. No modifica la utilidad.
    </p>
  );
}

export function IncomeStatementReport({ startDate, endDate, accountingBasis = "accrual" }: Props) {
  const report = useIncomeStatementData({ startDate, endDate, accountingBasis });
  const {
    filteredData, totals, statementRows, comparisonRows, yearTotals,
    depreciationBreakdownRows, cogsBreakdownRows,
    rentalBookedBreakdownRows, rentalUnbookedBreakdownRows, salesBreakdownRows,
    otherServicesBreakdownRows,
    damageRecoveryBreakdownRows,
    creditNotesBreakdownRows,
    expenseDetailBreakdownByCategory,
    rentedWithoutCost,
    soldWithoutCost,
    fxMissingCount,

    availableYears, selectedYear, setSelectedYear, isComparison,
    isError, isFetching, isPending, refetch,
  } = report;


  const { handleExportPdf, handleExportCsv, pdfLoading, csvLoading, exportDisabled, exportRows } = useStatementExports({
    ...report, startDate, endDate, accountingBasis,
  });

  const netPositive = totals.netProfit >= 0;
  // Hallazgo 10: la tarjeta de egresos NO incluye depreciación (la utilidad
  // neta sí la descuenta) — se renombra y se muestra la depreciación total
  // canónica que se descuenta de la utilidad, sin sumar componentes redondeados.
  const totalDepreciation = totals.depreciation;
  const kpis = [
    { label: "Ingresos", value: formatCurrency(totals.revenue), icon: RevenueIcon, color: "text-chart-2" },
    { label: "Egresos antes de depreciación", value: formatCurrency(totals.totalExpenses), icon: TrendingDownIcon, color: "text-destructive" },
    { label: "Depreciación total", value: formatCurrency(totalDepreciation), icon: TrendingDownIcon, color: "text-muted-foreground" },
    { label: "Utilidad Neta", value: formatCurrency(totals.netProfit), icon: netPositive ? TrendingUpIcon : TrendingDownIcon, color: netPositive ? "text-chart-2" : "text-destructive" },
    { label: "Margen Neto", ...formatMarginKpi(totals.margin), icon: Percent },
  ];

  // R22-B: un estado de resultados en ceros por falla de red induce a error.
  if (isError) {
    return (
      <QueryErrorState
        entity="el estado de resultados"
        onRetry={() => { void refetch(); }}
        isRetrying={isFetching}
      />
    );
  }

  if (isFetching || isPending) {
    return <div role="status" aria-live="polite" className="p-6 text-sm text-muted-foreground">Cargando estado de resultados… Las exportaciones estarán disponibles al terminar.</div>;
  }

  return (
    <>
      {selectedYear !== "all" && selectedYear !== "compare" && (fxMissingCount + rentedWithoutCost.length + soldWithoutCost.length > 0) && (
        <p className="text-xs text-muted-foreground">Las advertencias corresponden a la consulta completa {toYMD(startDate)} a {toYMD(endDate)}; no se recalculan al seleccionar un año.</p>
      )}
      <FxMissingAlert count={fxMissingCount} />


      {accountingBasis === "accrual" && rentedWithoutCost.length > 0 && (

        <Alert variant="warning">
          <WarnIcon className="h-4 w-4" />
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
          <WarnIcon className="h-4 w-4" />
          <AlertTitle>Equipos vendidos sin costo de adquisición</AlertTitle>
          <AlertDescription>
            Los siguientes equipos están marcados como vendidos pero no tienen costo de adquisición registrado, por lo que no aparecen en el Costo de Equipos Vendidos:{" "}
            <span className="font-semibold">{soldWithoutCost.map((fl) => fl.name).join(", ")}</span>.
            Actualiza el costo en la ficha del equipo.
          </AlertDescription>
        </Alert>
      )}

      <IncomeStatementBasisNote accountingBasis={accountingBasis} />


      {/* KPI: una columna en móvil, 2 en sm, 3 en lg y 5 desde xl.
          La etiqueta reserva al menos 2 líneas, sin limitar el texto;
          etiquetas y valores completos con ruptura de emergencia. */}
      {!isComparison && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-muted shrink-0 ${kpi.color}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere] leading-tight min-h-[2.5em]" title={kpi.label}>{kpi.label}</p>
                  <p className="text-lg font-bold tabular-nums [overflow-wrap:anywhere]" title={kpi.value}>{kpi.value}</p>
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
        csvRows={exportRows}
        csvFilename={isComparison ? "estado-resultados-comparativo.csv" : "estado-resultados.csv"}
        onExportPdf={handleExportPdf}
        pdfLoading={pdfLoading}
        onExportCsv={handleExportCsv}
        csvLoading={csvLoading}
        exportDisabled={exportDisabled}
      />

      <IncomeStatementTable
        key={`${toYMD(startDate)}:${toYMD(endDate)}:${accountingBasis}:${selectedYear}`}
        documentScope={{ startDate: toYMD(startDate), endDate: toYMD(endDate), accountingBasis }}
        documentsEnabled={!isFetching}
        isComparison={isComparison}
        filteredData={filteredData}
        yearTotals={yearTotals}
        comparisonRows={comparisonRows}
        statementRows={statementRows}
        depreciationBreakdownRows={depreciationBreakdownRows}
        cogsBreakdownRows={cogsBreakdownRows}
        rentalBookedBreakdownRows={rentalBookedBreakdownRows}
        rentalUnbookedBreakdownRows={rentalUnbookedBreakdownRows}
        salesBreakdownRows={salesBreakdownRows}
        otherServicesBreakdownRows={otherServicesBreakdownRows}
        damageRecoveryBreakdownRows={damageRecoveryBreakdownRows}
        creditNotesBreakdownRows={creditNotesBreakdownRows}
        expenseDetailBreakdownByCategory={expenseDetailBreakdownByCategory}
      />
      <DepreciationRoundingNote isComparison={isComparison} statementRows={statementRows} comparisonRows={comparisonRows} />
    </>
  );
}
