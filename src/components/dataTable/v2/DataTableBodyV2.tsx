import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { flexRender, type RowData } from "@tanstack/react-table";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { TableRowAction } from "@/components/dataTable/v2/types";
import { EmptyRow } from "@/components/feedback/EmptyRow";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { resolveColumnKind } from "./columnKind";
import { DataTableRowAction } from "./DataTableRowAction";
import { canActivateTableRow } from "./rowInteraction";
import { alignClass } from "./sorting";
import type { LiftgoRow } from "./types";

const PREFETCH_DELAY_MS = 120;

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
  onRowPrefetch?: (item: T) => unknown;
}


/**
 * Tanda 3 P1-6: extraído a hook para que `DataTableBodyV2` no toque refs en
 * render y deje de hacer bail-out del React Compiler (afectaba a las 25
 * filas × N celdas de TODAS las tablas). Los timers viven dentro del hook,
 * el body sólo recibe callbacks estables.
 */
function useRowPrefetchArm<T extends RowData>(onRowPrefetch: Props<T>["onRowPrefetch"]) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const arm = useCallback((item: T) => {
    if (!onRowPrefetch) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void queryClient.prefetchQuery(onRowPrefetch(item) as Parameters<QueryClient["prefetchQuery"]>[0]);
    }, PREFETCH_DELAY_MS);
  }, [onRowPrefetch, queryClient]);

  const disarm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  // Cleanup on unmount / handler change para evitar prefetches fantasma.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { arm, disarm };
}

interface RowHandlerCtx<T> {
  onRowClick?: (item: T) => void;
  onRowPrefetch?: (item: T) => unknown;
  armPrefetch: (item: T) => void;
  disarmPrefetch: () => void;
}

function buildRowHandlers<T>(item: T, ctx: RowHandlerCtx<T>) {
  const { onRowClick, onRowPrefetch, armPrefetch, disarmPrefetch } = ctx;
  const clickHandlers = onRowClick
    ? {
        onClick: (event: import("react").MouseEvent<HTMLTableRowElement>) => {
          if (canActivateTableRow(event)) onRowClick(item);
        },
      }
    : {};
  const prefetchHandlers = onRowPrefetch
    ? {
        onMouseEnter: () => armPrefetch(item),
        onMouseLeave: disarmPrefetch,
        onFocus: () => armPrefetch(item),
        onBlur: disarmPrefetch,
      }
    : {};
  return { ...clickHandlers, ...prefetchHandlers };
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
  onRowPrefetch,
}: Props<T>): ReactNode {
  const { arm: armPrefetch, disarm: disarmPrefetch } = useRowPrefetchArm(onRowPrefetch);
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
            {...buildRowHandlers(item, { onRowClick, onRowPrefetch, armPrefetch, disarmPrefetch })}
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

