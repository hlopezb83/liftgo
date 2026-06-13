import { Fragment } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { StatementRow } from "../../../hooks/useIncomeStatementData";
import { cellColor, formatCell, type BreakdownRow } from "./incomeStatementHelpers";

interface Props {
  row: StatementRow;
  breakdownRows: BreakdownRow[];
  isExpandable: boolean;
  isOpen: boolean;
  toggle: () => void;
  filteredCols: number;
}

export function StatementTableRow({ row, breakdownRows, isExpandable, isOpen, toggle, filteredCols }: Props) {
  return (
    <Fragment>
      <TableRow
        className={`${row.isSubtotal ? "bg-muted/40 border-t border-border" : ""} ${isExpandable ? "cursor-pointer hover:bg-muted/30" : ""}`}
        onClick={isExpandable ? toggle : undefined}
      >
        <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
          <span className="flex items-center gap-1">
            {isExpandable && (isOpen
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />)}
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
          <TableCell colSpan={filteredCols + 2} className="text-center text-xs text-muted-foreground italic py-2">
            Sin desglose disponible
          </TableCell>
        </TableRow>
      )}
      {isExpandable && isOpen && breakdownRows.map((bRow) => (
        <TableRow key={bRow.label} className="bg-muted/10">
          <TableCell className="sticky left-0 bg-muted/10 z-10 text-muted-foreground text-xs">{bRow.label}</TableCell>
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
    </Fragment>
  );
}
