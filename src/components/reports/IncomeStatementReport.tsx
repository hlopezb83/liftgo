import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToCsv } from "@/lib/exportCsv";
import { formatCurrency } from "@/lib/formatCurrency";
import { Download, TrendingUp, TrendingDown, DollarSign, Percent, FileDown, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useIncomeStatementData } from "@/hooks/useIncomeStatementData";
import { exportIncomeStatementPdf } from "@/lib/incomeStatementPdf";
import type { StatementRow, ComparisonRow } from "@/hooks/useIncomeStatementData";

interface Props {
  startDate: Date;
  endDate: Date;
  accountingBasis?: "accrual" | "cash";
}

export function IncomeStatementReport({ startDate, endDate, accountingBasis = "accrual" }: Props) {
  const {
    filteredData, totals, statementRows, comparisonRows, yearTotals,
    csvRows, depreciationBreakdownRows, rentedWithoutCost,
    availableYears, selectedYear, setSelectedYear, isComparison,
  } = useIncomeStatementData({ startDate, endDate, accountingBasis });

  const [showDepBreakdown, setShowDepBreakdown] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const kpis = [
    { label: "Ingresos", value: formatCurrency(totals.revenue), icon: DollarSign, color: "text-chart-2" },
    { label: "Total Egresos", value: formatCurrency(totals.totalExpenses), icon: TrendingDown, color: "text-destructive" },
    { label: "Utilidad Neta", value: formatCurrency(totals.netProfit), icon: TrendingUp, color: totals.netProfit >= 0 ? "text-chart-2" : "text-destructive" },
    { label: "Margen Neto", value: `${totals.margin.toFixed(1)}%`, icon: Percent, color: totals.margin >= 0 ? "text-chart-2" : "text-destructive" },
  ];

  const handleExportPdf = async () => {
    setPdfLoading(true);
    try {
      await exportIncomeStatementPdf({
        filteredData, statementRows, comparisonRows, yearTotals,
        isComparison, selectedYear, availableYears, startDate, endDate,
      });
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al generar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const formatCell = (row: StatementRow | ComparisonRow, value: number) => {
    if (row.isPercent) return `${value.toFixed(1)}%`;
    return formatCurrency(value);
  };

  const cellColor = (row: StatementRow | ComparisonRow, value: number) => {
    if (row.isPercent) return value >= 0 ? "" : "text-destructive";
    if (row.label === "= Utilidad Neta") return value >= 0 ? "" : "text-destructive";
    if (row.isCost) return "text-destructive";
    return "";
  };

  return (
    <>
      {rentedWithoutCost.length > 0 && (
        <Alert variant="destructive" className="border-amber-500/50 text-amber-700 dark:text-amber-400 [&>svg]:text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Equipos sin costo de adquisición</AlertTitle>
          <AlertDescription>
            Los siguientes equipos rentados no tienen costo de adquisición registrado y se omiten del cálculo de depreciación:{" "}
            <span className="font-semibold">{rentedWithoutCost.map((fl) => fl.name).join(", ")}</span>.
            Actualiza el costo en la ficha del equipo para incluirlos.
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

      <div className="flex items-center justify-end gap-2 flex-wrap">
        {availableYears.length > 1 && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {availableYears.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
              <SelectItem value="compare">Comparativo</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" onClick={() => exportToCsv("estado-resultados.csv", csvRows)}>
          <Download className="h-4 w-4 mr-1" />CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={pdfLoading}>
          <FileDown className="h-4 w-4 mr-1" />{pdfLoading ? "Generando..." : "PDF"}
        </Button>
      </div>

      {isComparison && comparisonRows.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Concepto</TableHead>
                  {yearTotals.map((yt) => (
                    <TableHead key={yt.year} className="text-right min-w-[120px]">{yt.year}</TableHead>
                  ))}
                  <TableHead className="text-right min-w-[120px] font-bold">Var. $</TableHead>
                  <TableHead className="text-right min-w-[100px] font-bold">Var. %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonRows.map((row) => (
                  <TableRow key={row.label} className={row.isSubtotal ? "bg-muted/40 border-t border-border" : ""}>
                    <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
                      {row.label}
                    </TableCell>
                    {row.yearValues.map((val, i) => (
                      <TableCell key={i} className={`text-right font-mono ${row.isSubtotal ? "font-semibold" : ""} ${cellColor(row, val)}`}>
                        {formatCell(row, val)}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-mono font-bold ${row.delta >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      {row.isPercent ? `${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(1)} pp` : `${row.delta >= 0 ? "+" : ""}${formatCurrency(row.delta)}`}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${row.deltaPct !== null && row.deltaPct >= 0 ? "text-chart-2" : "text-destructive"}`}>
                      {row.deltaPct !== null ? `${row.deltaPct >= 0 ? "+" : ""}${row.deltaPct.toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isComparison && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[180px]">Concepto</TableHead>
                  {filteredData.map((d) => (
                    <TableHead key={d.month} className="text-right min-w-[110px]">{d.month}</TableHead>
                  ))}
                  <TableHead className="text-right min-w-[120px] font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statementRows.map((row) => {
                  const isDepRow = row.label === "(-) Depreciación (Equipos Rentados)";
                  return (
                    <>
                      <TableRow
                        key={row.label}
                        className={`${row.isSubtotal ? "bg-muted/40 border-t border-border" : ""} ${isDepRow ? "cursor-pointer hover:bg-muted/30" : ""}`}
                        onClick={isDepRow ? () => setShowDepBreakdown(!showDepBreakdown) : undefined}
                      >
                        <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
                          <span className="flex items-center gap-1">
                            {isDepRow && (
                              showDepBreakdown
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {row.label}
                          </span>
                        </TableCell>
                        {row.values.map((val, i) => (
                          <TableCell
                            key={i}
                            className={`text-right font-mono ${row.isSubtotal ? "font-semibold" : ""} ${cellColor(row, val)}`}
                          >
                            {formatCell(row, val)}
                          </TableCell>
                        ))}
                        <TableCell
                          className={`text-right font-mono font-bold ${cellColor(row, row.total)}`}
                        >
                          {formatCell(row, row.total)}
                        </TableCell>
                      </TableRow>
                      {isDepRow && showDepBreakdown && depreciationBreakdownRows.map((bRow) => (
                        <TableRow key={bRow.label} className="bg-muted/10">
                          <TableCell className="sticky left-0 bg-muted/10 z-10 text-muted-foreground text-xs">
                            {bRow.label}
                          </TableCell>
                          {bRow.values.map((val, i) => (
                            <TableCell key={i} className="text-right font-mono text-xs text-muted-foreground">
                              {val > 0 ? formatCurrency(val) : "—"}
                            </TableCell>
                          ))}
                          <TableCell className="text-right font-mono text-xs font-semibold text-muted-foreground">
                            {formatCurrency(bRow.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
