import type { ReactNode } from "react";
import { flexRender, type Row } from "@tanstack/react-table";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyRow } from "@/components/EmptyRow";
import { cn } from "@/lib/utils";
import { alignClass } from "./sorting";

interface Props<T> {
  rows: Row<T>[];
  columnCount: number;
  emptyMessage: string;
  showSelection: boolean;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
}

export function DataTableBodyV2<T>({
  rows,
  columnCount,
  emptyMessage,
  showSelection,
  onRowClick,
  rowClassName,
}: Props<T>): ReactNode {
  if (rows.length === 0) {
    return (
      <TableBody>
        <EmptyRow colSpan={columnCount + (showSelection ? 1 : 0)} message={emptyMessage} />
      </TableBody>
    );
  }

  return (
    <TableBody>
      {rows.map((row) => {
        const item = row.original;
        const isSelected = row.getIsSelected();
        return (
          <TableRow
            key={row.id}
            data-state={isSelected ? "selected" : undefined}
            className={cn(onRowClick && "cursor-pointer", rowClassName?.(item))}
            onClick={onRowClick ? () => onRowClick(item) : undefined}
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
