import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ComparisonRow } from "../../../hooks/useIncomeStatementData";
import { cellColor, formatCell, formatRowDelta } from "./incomeStatementHelpers";

interface YearTotal { year: string }

interface Props {
  comparisonRows: ComparisonRow[];
  yearTotals: YearTotal[];
}

export function ComparisonTable({ comparisonRows, yearTotals }: Props) {
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
