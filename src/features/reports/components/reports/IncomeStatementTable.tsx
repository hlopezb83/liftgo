import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ComparisonTable } from "./incomeStatement/ComparisonTable";
import { getBreakdownFor, type BreakdownRow } from "./incomeStatement/incomeStatementHelpers";
import { StatementTableRow } from "./incomeStatement/StatementTableRow";
import type { StatementRow, ComparisonRow } from "../../hooks/useIncomeStatementData";

interface MonthData { month: string }
interface YearTotal { year: string }

interface Props {
  isComparison: boolean;
  filteredData: MonthData[];
  yearTotals: YearTotal[];
  comparisonRows: ComparisonRow[];
  statementRows: StatementRow[];
  depreciationBreakdownRows: BreakdownRow[];
  cogsBreakdownRows: BreakdownRow[];
  rentalBookedBreakdownRows: BreakdownRow[];
  rentalUnbookedBreakdownRows: BreakdownRow[];
  salesBreakdownRows: BreakdownRow[];
  damageRecoveryBreakdownRows: BreakdownRow[];
}

export function IncomeStatementTable({
  isComparison, filteredData, yearTotals, comparisonRows, statementRows,
  depreciationBreakdownRows, cogsBreakdownRows,
  rentalBookedBreakdownRows, rentalUnbookedBreakdownRows, salesBreakdownRows,
  damageRecoveryBreakdownRows,
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    dep: false, cogs: false, rentalBooked: false, rentalUnbooked: false, sales: false, damageRecovery: false,
  });

  if (isComparison && comparisonRows.length > 0) {
    return <ComparisonTable comparisonRows={comparisonRows} yearTotals={yearTotals} />;
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
              const breakdown = getBreakdownFor(row.label, depreciationBreakdownRows, cogsBreakdownRows, rentalBookedBreakdownRows, rentalUnbookedBreakdownRows, salesBreakdownRows, damageRecoveryBreakdownRows);
              const isExpandable = breakdown !== null;
              const isOpen = isExpandable && !!open[breakdown.key];
              const toggle = () => breakdown && setOpen((prev) => ({ ...prev, [breakdown.key]: !prev[breakdown.key] }));

              return (
                <StatementTableRow
                  key={row.label}
                  row={row}
                  breakdownRows={breakdown?.rows ?? []}
                  isExpandable={isExpandable}
                  isOpen={isOpen}
                  toggle={toggle}
                  filteredCols={filteredData.length}
                />
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
