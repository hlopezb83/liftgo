import { Fragment, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import {
  cellColor,
  formatCell,
  type BreakdownRow,
} from "./incomeStatementHelpers";
import type { StatementRow } from "../../../hooks/useIncomeStatementData";

type OpenDocuments = (
  label: string | null,
  amount: number,
  monthIndex?: number,
) => void;

interface Props {
  onOpenDocuments?: OpenDocuments;
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
  onOpenDocuments,
}: {
  onOpenDocuments?: OpenDocuments;
  row: StatementRow;
  isExpandable: boolean;
  isOpen: boolean;
  toggle: () => void;
}) {
  return (
    <TableRow
      className={`${row.isSubtotal ? "bg-muted/40 border-t border-border" : ""}`}
    >
      <TableCell
        className={`sticky left-0 bg-background z-10 ${row.isSubtotal ? "font-semibold bg-muted/40" : ""}`}
      >
        <span className="flex items-center gap-1">
          {isExpandable ? (
            isOpen ? (
              <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
            )
          ) : null}
          {isExpandable ? (
            <button
              type="button"
              className="text-left focus-visible:outline focus-visible:outline-2"
              aria-expanded={isOpen}
              onClick={toggle}
            >
              {row.label}
            </button>
          ) : (
            row.label
          )}
        </span>
      </TableCell>
      {row.values.map((val, i) => (
        <TableCell
          key={i}
          className={`text-right font-mono ${row.isSubtotal ? "font-semibold" : ""} ${cellColor(row, val)}`}
        >
          {onOpenDocuments && val !== null && val !== 0 ? (
            <DocumentAmount
              label={`Ver documentos de ${row.label.trim()}, columna ${i + 1}`}
              onOpen={() => onOpenDocuments(null, val, i)}
            >
              {formatCell(row, val)}
            </DocumentAmount>
          ) : (
            formatCell(row, val)
          )}
        </TableCell>
      ))}
      <TableCell
        className={`text-right font-mono font-bold ${cellColor(row, row.total)}`}
      >
        {onOpenDocuments && row.total !== null && row.total !== 0 ? (
          <DocumentAmount
            label={`Ver documentos de ${row.label.trim()}, total`}
            onOpen={() => onOpenDocuments(null, row.total ?? 0)}
          >
            {formatCell(row, row.total)}
          </DocumentAmount>
        ) : (
          formatCell(row, row.total)
        )}
      </TableCell>
    </TableRow>
  );
}

function DocumentAmount({
  label,
  onOpen,
  children,
}: {
  label: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="underline decoration-dotted underline-offset-4 focus-visible:outline focus-visible:outline-2"
      aria-label={label}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {children}
    </button>
  );
}

function BreakdownRowGroup({
  breakdownRows,
  onOpenDocuments,
}: {
  breakdownRows: BreakdownRow[];
  onOpenDocuments?: OpenDocuments;
}) {
  return (
    <>
      {breakdownRows.map((bRow) => (
        <TableRow key={bRow.label} className="bg-muted/10">
          <TableCell className="sticky left-0 bg-muted/10 z-10 text-muted-foreground text-xs">
            {onOpenDocuments ? (
              <DocumentAmount
                label={`Ver documentos de ${bRow.label.trim()}`}
                onOpen={() => onOpenDocuments(bRow.label, bRow.total)}
              >
                {bRow.label}
              </DocumentAmount>
            ) : (
              bRow.label
            )}
          </TableCell>
          {bRow.values.map((val, i) => (
            <TableCell
              key={i}
              className="text-right font-mono text-xs text-muted-foreground"
            >
              {onOpenDocuments && val !== 0 ? (
                <DocumentAmount
                  label={`Ver documentos de ${bRow.label.trim()}, columna ${i + 1}`}
                  onOpen={() => onOpenDocuments(bRow.label, val, i)}
                >
                  {formatCurrency(val)}
                </DocumentAmount>
              ) : val > 0 ? (
                formatCurrency(val)
              ) : (
                "—"
              )}
            </TableCell>
          ))}
          <TableCell className="text-right font-mono text-xs font-semibold text-muted-foreground">
            {onOpenDocuments && bRow.total !== 0 ? (
              <DocumentAmount
                label={`Ver documentos de ${bRow.label.trim()}, total`}
                onOpen={() => onOpenDocuments(bRow.label, bRow.total)}
              >
                {formatCurrency(bRow.total)}
              </DocumentAmount>
            ) : (
              formatCurrency(bRow.total)
            )}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function StatementTableRow({
  onOpenDocuments,
  row,
  breakdownRows,
  isExpandable,
  isOpen,
  toggle,
  filteredCols,
}: Props) {
  const showEmptyHint = isExpandable && isOpen && breakdownRows.length === 0;
  const showBreakdown = isExpandable && isOpen && breakdownRows.length > 0;
  return (
    <Fragment>
      <StatementMainRow
        onOpenDocuments={onOpenDocuments}
        row={row}
        isExpandable={isExpandable}
        isOpen={isOpen}
        toggle={toggle}
      />
      {showEmptyHint ? (
        <TableRow className="bg-muted/10">
          <TableCell
            colSpan={filteredCols + 2}
            className="text-center text-xs text-muted-foreground italic py-2"
          >
            Sin desglose disponible
          </TableCell>
        </TableRow>
      ) : null}
      {showBreakdown ? (
        <BreakdownRowGroup
          onOpenDocuments={onOpenDocuments}
          breakdownRows={breakdownRows}
        />
      ) : null}
    </Fragment>
  );
}
