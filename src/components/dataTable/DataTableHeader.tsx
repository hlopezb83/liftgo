import type { ReactNode } from "react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { SortableTableHead } from "@/components/SortableTableHead";
import { cn } from "@/lib/utils";
import { alignClass } from "./sorting";
import type { DataTableColumn } from "./types";

interface Props<T> {
  columns: DataTableColumn<T>[];
  sortKey: string | null;
  sortDirection: "asc" | "desc";
  onToggleSort: (key: string) => void;
  showSelection: boolean;
  headerCheckedState: boolean | "indeterminate";
  onToggleAll: (value: boolean) => void;
}

export function DataTableHeader<T>({
  columns, sortKey, sortDirection, onToggleSort,
  showSelection, headerCheckedState, onToggleAll,
}: Props<T>): ReactNode {
  return (
    <TableHeader>
      <TableRow>
        {showSelection && (
          <TableHead className="w-10 px-3">
            <Checkbox
              checked={headerCheckedState}
              onCheckedChange={(value) => onToggleAll(!!value)}
              aria-label="Seleccionar todas las filas"
            />
          </TableHead>
        )}
        {columns.map((col) =>
          col.sortable ? (
            <SortableTableHead
              key={col.key}
              sortKey={col.key}
              currentSort={sortKey}
              currentDirection={sortDirection}
              onSort={onToggleSort}
              className={cn(alignClass[col.align ?? "left"], col.hideOnMobile && "hidden md:table-cell", col.headClassName)}
            >
              {col.label}
            </SortableTableHead>
          ) : (
            <TableHead
              key={col.key}
              className={cn(alignClass[col.align ?? "left"], col.hideOnMobile && "hidden md:table-cell", col.headClassName)}
            >
              {col.label}
            </TableHead>
          ),
        )}
      </TableRow>
    </TableHeader>
  );
}
