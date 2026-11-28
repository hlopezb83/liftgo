import { flexRender, type RowData } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, type ReactNode, type Ref } from "react";
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

interface Props<T extends RowData> {
  rows: LiftgoRow<T>[];
  columnCount: number;
  emptyMessage: string;
  showSelection: boolean;
  /** R-Sel: ver `DataTableBodyV2`; invalida el memo cuando cambia la selección. */
  selectionKey?: string;
  onRowClick?: (item: T) => void;
  rowAction?: TableRowAction<T>;
  rowClassName?: (item: T) => string | undefined;
  onRowHover?: (item: T) => void;
  estimateRowHeight?: number;
  maxHeight?: number;
}

export function VirtualBody<T extends RowData>({
  rows,
  columnCount,
  emptyMessage,
  showSelection,
  selectionKey = "",
  onRowClick,
  rowAction,
  rowClassName,
  onRowHover,
  estimateRowHeight = 44,
  maxHeight = 600,
}: Props<T>): ReactNode {
  const selectedIds = new Set(selectionKey ? selectionKey.split(",") : []);
  const parentRef = useRef<HTMLDivElement>(null);
  const { arm: armHover, disarm: disarmHover } = useRowHoverIntent(onRowHover);
  // `useVirtualizer` retorna una API imperativa que muta internamente y no puede
  // memoizarse por el React Compiler. Es un patrón oficial de TanStack Virtual.
  // eslint-disable-next-line react-hooks/incompatible-library
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
      ref={parentRef as unknown as Ref<HTMLTableSectionElement>}
      style={{ display: "block", maxHeight, overflow: "auto" }}
    >
      {paddingTop > 0 && (
        <TableRow style={{ display: "block", height: paddingTop }} aria-hidden />
      )}
      {items.map((vi) => {
        const row = rows[vi.index];
        const item = row.original;
        const isSelected = selectedIds.has(row.id);
        return (
          <TableRow
            key={row.id}
            data-index={vi.index}
            data-state={isSelected ? "selected" : undefined}
            ref={virtualizer.measureElement}
            className={cn(
              "table w-full table-fixed",
              vi.index % 2 === 1 && "bg-muted/40",
              onRowClick && "cursor-pointer",
              rowClassName?.(item),
            )}
            style={{ display: "table", width: "100%" }}
            onClick={onRowClick ? (event) => { if (canActivateTableRow(event)) onRowClick(item); } : undefined}
            onMouseEnter={onRowHover ? () => armHover(item) : undefined}
            onMouseLeave={onRowHover ? disarmHover : undefined}
            onFocus={onRowHover ? () => armHover(item) : undefined}
            onBlur={onRowHover ? disarmHover : undefined}
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
      {paddingBottom > 0 && (
        <TableRow style={{ display: "block", height: paddingBottom }} aria-hidden />
      )}
    </TableBody>
  );
}
