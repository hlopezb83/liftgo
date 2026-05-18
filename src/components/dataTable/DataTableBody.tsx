import type { ReactNode } from "react";
import { flexRender, type Row } from "@tanstack/react-table";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyRow } from "@/components/EmptyRow";
import { cn } from "@/lib/utils";
import { alignClass } from "./sorting";
import type { DataTableColumn } from "./types";

interface Props<T> {
  rows: Row<T>[];
  columns: DataTableColumn<T>[];
  emptyMessage: string;
  showSelection: boolean;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
}

export function DataTableBody<T>({
  rows, columns, emptyMessage, showSelection, onRowClick, rowClassName,
}: Props<T>): ReactNode {
  return (
    <TableBody>
      {rows.length === 0 ? (
        <EmptyRow colSpan={columns.length + (showSelection ? 1 : 0)} message={emptyMessage} />
      ) : (
        rows.map((row) => {
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
                const col = columns.find((c) => c.key === cell.column.id);
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      alignClass[col?.align ?? "left"],
                      col?.hideOnMobile && "hidden md:table-cell",
                      col?.className,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          );
        })
      )}
    </TableBody>
  );
}
