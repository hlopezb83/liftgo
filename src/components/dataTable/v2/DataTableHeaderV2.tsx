import type { ReactNode } from "react";
import { flexRender, type Table as TanstackTable } from "@tanstack/react-table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { alignClass } from "./sorting";

interface Props<T> {
  table: TanstackTable<T>;
  showSelection: boolean;
}

export function DataTableHeaderV2<T>({ table, showSelection }: Props<T>): ReactNode {
  const allRows = table.getRowModel().rows;
  const selectable = allRows.filter((r) => r.getCanSelect());
  const allSelected = selectable.length > 0 && selectable.every((r) => r.getIsSelected());
  const someSelected = selectable.some((r) => r.getIsSelected());
  const headerCheckedState: boolean | "indeterminate" = allSelected
    ? true
    : someSelected
      ? "indeterminate"
      : false;

  return (
    <TableHeader>
      {table.getHeaderGroups().map((group) => (
        <TableRow key={group.id}>
          {showSelection && (
            <TableHead className="w-10 px-3">
              <Checkbox
                checked={headerCheckedState}
                onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
                aria-label="Seleccionar todas las filas"
              />
            </TableHead>
          )}
          {group.headers.map((header) => {
            const meta = header.column.columnDef.meta;
            const canSort = header.column.getCanSort();
            const sortDir = header.column.getIsSorted();
            const className = cn(
              alignClass[meta?.align ?? "left"],
              meta?.hideOnMobile && "hidden md:table-cell",
              meta?.headClassName,
              canSort && "cursor-pointer select-none hover:text-foreground transition-colors",
              sortDir && "text-foreground",
            );
            return (
              <TableHead
                key={header.id}
                className={className}
                onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
              >
                {header.isPlaceholder ? null : (
                  <div className={cn("flex items-center gap-1", meta?.align === "right" && "justify-end")}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort &&
                      (sortDir === "asc" ? (
                        <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                      ) : sortDir === "desc" ? (
                        <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
                      ))}
                  </div>
                )}
              </TableHead>
            );
          })}
        </TableRow>
      ))}
    </TableHeader>
  );
}
