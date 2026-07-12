import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { flexRender, type Row } from "@tanstack/react-table";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
type PrefetchQueryOptions = Parameters<QueryClient["prefetchQuery"]>[0];
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyRow } from "@/components/feedback/EmptyRow";
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
  onRowPrefetch?: (item: T) => PrefetchQueryOptions;
  estimateRowHeight?: number;
  maxHeight?: number;
}

export function VirtualBody<T>({
  rows,
  columnCount,
  emptyMessage,
  showSelection,
  onRowClick,
  rowClassName,
  onRowPrefetch,
  estimateRowHeight = 44,
  maxHeight = 600,
}: Props<T>): ReactNode {
  const parentRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armPrefetch = (item: T) => {
    if (!onRowPrefetch) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void queryClient.prefetchQuery(onRowPrefetch(item));
    }, PREFETCH_DELAY_MS);
  };
  const disarmPrefetch = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 8,
  });

  if (rows.length === 0) {
    return (
      <TableBody>
        <EmptyRow colSpan={columnCount + (showSelection ? 1 : 0)} message={emptyMessage} />
      </TableBody>
    );
  }

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items.length > 0 ? items[0].start : 0;
  const paddingBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0;

  return (
    <TableBody
      ref={parentRef as unknown as React.Ref<HTMLTableSectionElement>}
      style={{ display: "block", maxHeight, overflow: "auto" }}
    >
      {paddingTop > 0 && (
        <TableRow style={{ display: "block", height: paddingTop }} aria-hidden />
      )}
      {items.map((vi) => {
        const row = rows[vi.index];
        const item = row.original;
        const isSelected = row.getIsSelected();
        return (
          <TableRow
            key={row.id}
            data-index={vi.index}
            data-state={isSelected ? "selected" : undefined}
            ref={virtualizer.measureElement}
            className={cn("table w-full table-fixed", onRowClick && "cursor-pointer", rowClassName?.(item))}
            style={{ display: "table", width: "100%" }}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
            onMouseEnter={onRowPrefetch ? () => armPrefetch(item) : undefined}
            onMouseLeave={onRowPrefetch ? disarmPrefetch : undefined}
            onFocus={onRowPrefetch ? () => armPrefetch(item) : undefined}
            onBlur={onRowPrefetch ? disarmPrefetch : undefined}
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
      {paddingBottom > 0 && (
        <TableRow style={{ display: "block", height: paddingBottom }} aria-hidden />
      )}
    </TableBody>
  );
}
