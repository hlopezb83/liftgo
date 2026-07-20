import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { flexRender, type Row } from "@tanstack/react-table";
import { useCallback, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { EmptyRow } from "@/components/feedback/EmptyRow";
import { Checkbox } from "@/components/ui/checkbox";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { alignClass } from "./sorting";

const PREFETCH_DELAY_MS = 120;

interface Props<T> {
  rows: Row<T>[];
  columnCount: number;
  emptyMessage: string;
  showSelection: boolean;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
  onRowPrefetch?: (item: T) => unknown;
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
        onClick: () => onRowClick(item),
        onKeyDown: (e: ReactKeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onRowClick(item);
          }
        },
        tabIndex: 0,
        role: "button" as const,
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



export function DataTableBodyV2<T>({
  rows,
  columnCount,
  emptyMessage,
  showSelection,
  onRowClick,
  rowClassName,
  onRowPrefetch,
}: Props<T>): ReactNode {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armPrefetch = useCallback((item: T) => {
    if (!onRowPrefetch) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void queryClient.prefetchQuery(onRowPrefetch(item) as Parameters<QueryClient["prefetchQuery"]>[0]);
    }, PREFETCH_DELAY_MS);
  }, [onRowPrefetch, queryClient]);
  const disarmPrefetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);


  if (rows.length === 0) {
    return (
      <TableBody>
        <EmptyRow colSpan={columnCount + (showSelection ? 1 : 0)} message={emptyMessage} />
      </TableBody>
    );
  }

  return (
    <TableBody>
      {/* eslint-disable-next-line react-hooks/refs -- closure sobre timerRef sólo se invoca en handlers, no en render */}
      {rows.map((row) => {
        const item = row.original;
        const isSelected = row.getIsSelected();
        return (
          <TableRow
            key={row.id}
            data-state={isSelected ? "selected" : undefined}
            className={cn(
              onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
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
              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    alignClass[meta?.align ?? "left"],
                    meta?.hideOnMobile && "hidden md:table-cell",
                    meta?.cellClassName,
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              );
            })}
          </TableRow>
        );
      })}
    </TableBody>
  );
}
