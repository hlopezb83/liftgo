import { flexRender, type RowData } from "@tanstack/react-table";
import type { TableRowAction } from "@/components/dataTable/v2/types";
import { EmptyRow } from "@/components/feedback/EmptyRow";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { resolveColumnKind } from "./columnKind";
import { DataTableRowAction } from "./DataTableRowAction";
import { canActivateTableRow } from "./rowInteraction";
import { alignClass } from "./sorting";
import { useRowHoverIntent } from "./useRowHoverIntent";
import type { LiftgoRow } from "./types";
import type { MouseEvent, ReactNode } from "react";

interface Props<T extends RowData> {
  rows: LiftgoRow<T>[];
  columnCount: number;
  emptyMessage: string;
  showSelection: boolean;
  /**
   * R-Sel: ids seleccionados serializados. `rows` conserva la MISMA referencia
   * entre renders (TanStack cachea el row model), así que el React Compiler
   * memoizaba el body y los checkboxes nunca se pintaban marcados. Esta llave
   * de string cambia con la selección e invalida el memo.
   */
  selectionKey?: string;
  onRowClick?: (item: T) => void;
  rowAction?: TableRowAction<T>;
  rowClassName?: (item: T) => string | undefined;
  onRowHover?: (item: T) => void;
}

interface RowHandlerCtx<T> {
  onRowClick?: (item: T) => void;
  onRowHover?: (item: T) => void;
  armHover: (item: T) => void;
  disarmHover: () => void;
}

function buildRowHandlers<T>(item: T, ctx: RowHandlerCtx<T>) {
  const { onRowClick, onRowHover, armHover, disarmHover } = ctx;
  const clickHandlers = onRowClick
    ? {
        onClick: (event: MouseEvent<HTMLTableRowElement>) => {
          if (canActivateTableRow(event)) onRowClick(item);
        },
      }
    : {};
  const hoverHandlers = onRowHover
    ? {
        onMouseEnter: () => armHover(item),
        onMouseLeave: disarmHover,
        onFocus: () => armHover(item),
        onBlur: disarmHover,
      }
    : {};
  return { ...clickHandlers, ...hoverHandlers };
}

export function DataTableBodyV2<T extends RowData>({
  rows,
  columnCount,
  emptyMessage,
  showSelection,
  selectionKey = "",
  onRowClick,
  rowAction,
  rowClassName,
  onRowHover,
}: Props<T>): ReactNode {
  const { arm: armHover, disarm: disarmHover } = useRowHoverIntent(onRowHover);
  const selectedIds = new Set(selectionKey ? selectionKey.split(",") : []);

  if (rows.length === 0) {
    return (
      <TableBody>
        <EmptyRow colSpan={columnCount + (showSelection ? 1 : 0)} message={emptyMessage} />
      </TableBody>
    );
  }

  return (
    <TableBody>
      {rows.map((row, rowIndex) => {
        const item = row.original;
        const isSelected = selectedIds.has(row.id);

        return (
          <TableRow
            key={row.id}
            data-state={isSelected ? "selected" : undefined}
            className={cn(
              // Oleada 1 (A-8): zebra uniforme en todas las tablas
              rowIndex % 2 === 1 && "bg-muted/40",
              onRowClick && "cursor-pointer",
              rowClassName?.(item),
            )}
            {...buildRowHandlers(item, { onRowClick, onRowHover, armHover, disarmHover })}
          >
            {showSelection && (
              <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  disabled={!row.getCanSelect()}
                  onCheckedChange={(value) => row.toggleSelected(!!value)}
                  aria-label="Seleccionar fila"
                />
              </TableCell>
            )}
            {row.getVisibleCells().map((cell) => {
              const meta = cell.column.columnDef.meta;
              const { align, kindClassName } = resolveColumnKind(meta);
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    alignClass[align],
                    kindClassName,
                    meta?.hideOnMobile && "hidden md:table-cell",
                    meta?.cellClassName,
                  )}
                >
                  <DataTableRowAction item={item} columnId={cell.column.id} action={rowAction} onActivate={onRowClick}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </DataTableRowAction>
                </TableCell>
              );
            })}
          </TableRow>
        );
      })}
    </TableBody>
  );
}

