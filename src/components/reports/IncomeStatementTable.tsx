import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import type { StatementRow, ComparisonRow } from "@/hooks/useIncomeStatementData";

interface MonthData { month: string }
interface YearTotal { year: string }
interface BreakdownRow { label: string; values: number[]; total: number }

interface Props {
  isComparison: boolean;
  filteredData: MonthData[];
  yearTotals: YearTotal[];
  comparisonRows: ComparisonRow[];
  statementRows: StatementRow[];
  depreciationBreakdownRows: BreakdownRow[];
  rentalBreakdownRows: BreakdownRow[];
  salesBreakdownRows: BreakdownRow[];
}

const formatCell = (row: StatementRow | ComparisonRow, value: number) =>
  row.isPercent ? `${value.toFixed(1)}%` : formatCurrency(value);

function formatRowDelta(row: ComparisonRow): string {
  const sign = row.delta >= 0 ? "+" : "";
  if (row.isPercent) return `${sign}${row.delta.toFixed(1)} pp`;
  return `${sign}${formatCurrency(row.delta)}`;
}

const cellColor = (row: StatementRow | ComparisonRow, value: number) => {
  if (row.isCost) return "text-destructive";
  if (value < 0) return "text-destructive";
  return "";
};

export function IncomeStatementTable({
  isComparison, filteredData, yearTotals, comparisonRows, statementRows,
  depreciationBreakdownRows, rentalBreakdownRows, salesBreakdownRows,
}: Props) {
  const [showDepBreakdown, setShowDepBreakdown] = useState(false);
  const [showRentalBreakdown, setShowRentalBreakdown] = useState(false);
  const [showSalesBreakdown, setShowSalesBreakdown] = useState(false);

  if (isComparison && comparisonRows.length > 0) {
    return (
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
                    {formatRowDelta(row)}
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
    );
  }

  if (isComparison) return null;

  return (
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
              const isRentalRow = row.label === "  Ingresos por Rentas";
              const isSalesRow = row.label === "  Ingresos por Ventas";
              const isExpandable = isDepRow || isRentalRow || isSalesRow;
              const isOpen = (isDepRow && showDepBreakdown) || (isRentalRow && showRentalBreakdown) || (isSalesRow && showSalesBreakdown);
              const toggle = () => {
                if (isDepRow) setShowDepBreakdown((v) => !v);
                else if (isRentalRow) setShowRentalBreakdown((v) => !v);
                else if (isSalesRow) setShowSalesBreakdown((v) => !v);
              };
              const breakdownRows = isDepRow ? depreciationBreakdownRows
                : isRentalRow ? rentalBreakdownRows
                : isSalesRow ? salesBreakdownRows
                : [];
              return (
                <>
                  <TableRow
                    key={row.label}
                    className={`${row.isSubtotal ? "bg-muted/40 border-t border-border" : ""} ${isExpandable ? "cursor-pointer hover:bg-muted/30" : ""}`}
                    onClick={isExpandable ? toggle : undefined}
                  >
                    <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
                      <span className="flex items-center gap-1">
                        {isExpandable && (
                          isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {row.label}
                      </span>
                    </TableCell>
                    {row.values.map((val, i) => (
                      <TableCell key={i} className={`text-right font-mono ${row.isSubtotal ? "font-semibold" : ""} ${cellColor(row, val)}`}>
                        {formatCell(row, val)}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-mono font-bold ${cellColor(row, row.total)}`}>
                      {formatCell(row, row.total)}
                    </TableCell>
                  </TableRow>
                  {isExpandable && isOpen && breakdownRows.length === 0 && (
                    <TableRow className="bg-muted/10">
                      <TableCell colSpan={filteredData.length + 2} className="text-center text-xs text-muted-foreground italic py-2">
                        Sin desglose disponible
                      </TableCell>
                    </TableRow>
                  )}
                  {isExpandable && isOpen && breakdownRows.map((bRow) => (
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
  );
}
