import { Fragment } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import { cellColor, formatCell, type BreakdownRow } from "./incomeStatementHelpers";
import type { StatementRow } from "../../../hooks/useIncomeStatementData";

interface Props {
  row: StatementRow;
  breakdownRows: BreakdownRow[];
  isExpandable: boolean;
  isOpen: boolean;
  toggle: () => void;
  filteredCols: number;
}

function StatementMainRow({
  row,
  isExpandable,
  isOpen,
  toggle,
}: {
  row: StatementRow;
  isExpandable: boolean;
  isOpen: boolean;
  toggle: () => void;
}) {
  const handleKeyDown = isExpandable
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }
    : undefined;

  return (
    <TableRow
      className={`${row.isSubtotal ? "bg-muted/40 border-t border-border" : ""} ${isExpandable ? "cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" : ""}`}
      onClick={isExpandable ? toggle : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={isExpandable ? 0 : undefined}
      role={isExpandable ? "button" : undefined}
      aria-expanded={isExpandable ? isOpen : undefined}
    >
      <TableCell className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}>
        <span className="flex items-center gap-1">
          {isExpandable ? (isOpen
            ? <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />) : null}
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
  );
}

function BreakdownRowGroup({ breakdownRows }: { breakdownRows: BreakdownRow[] }) {
  return (
    <>
      {breakdownRows.map((bRow) => (
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
    </>
  );
}

export function StatementTableRow({ row, breakdownRows, isExpandable, isOpen, toggle, filteredCols }: Props) {
  const showEmptyHint = isExpandable && isOpen && breakdownRows.length === 0;
  const showBreakdown = isExpandable && isOpen && breakdownRows.length > 0;
  return (
    <Fragment>
      <StatementMainRow row={row} isExpandable={isExpandable} isOpen={isOpen} toggle={toggle} />
      {showEmptyHint ? (
        <TableRow className="bg-muted/10">
          <TableCell colSpan={filteredCols + 2} className="text-center text-xs text-muted-foreground italic py-2">
            Sin desglose disponible
          </TableCell>
        </TableRow>
      ) : null}
      {showBreakdown ? <BreakdownRowGroup breakdownRows={breakdownRows} /> : null}
    </Fragment>
  );
}
