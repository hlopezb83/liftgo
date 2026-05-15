import { ReactNode, useMemo, useState, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type SortingFn,
  type Row,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/SortableTableHead";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyRow } from "@/components/EmptyRow";
import { MobileCardList } from "@/components/MobileCardList";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export type ColumnAlign = "left" | "right" | "center";

export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  accessor?: (item: T) => unknown;
  render: (item: T, index: number) => ReactNode;
  align?: ColumnAlign;
  className?: string;
  headClassName?: string;
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string | undefined;
  mobileCardRender?: (item: T) => ReactNode;
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  footer?: ReactNode;
  className?: string;
}

const alignClass: Record<ColumnAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// Espejo del comparador anterior de useSort: nulls al final, números nativos,
// strings con localeCompare insensible a acentos y numeric:true.
const liftgoSortingFn: SortingFn<unknown> = (rowA: Row<unknown>, rowB: Row<unknown>, columnId: string) => {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
};

function DataTableInner<T>({
  columns,
  data,
  isLoading,
  keyExtractor,
  emptyMessage = "Sin resultados",
  onRowClick,
  rowClassName,
  mobileCardRender,
  defaultSortKey,
  defaultSortDirection = "asc",
  footer,
  className,
}: DataTableProps<T>) {
  const isMobile = useIsMobile();

  // Firma estable basada en `key` para no invalidar columnas cuando el padre
  // pasa arrays inline equivalentes.
  const columnsKey = columns.map((c) => c.key).join("|");

  const columnDefs = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        id: col.key,
        accessorFn: col.accessor ?? ((row: T) => (row as Record<string, unknown>)[col.key]),
        enableSorting: !!col.sortable,
        sortingFn: liftgoSortingFn as SortingFn<T>,
        cell: (ctx) => col.render(ctx.row.original, ctx.row.index),
        header: () => col.label,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnsKey],
  );

  const [sorting, setSorting] = useState<SortingState>(
    defaultSortKey ? [{ id: defaultSortKey, desc: defaultSortDirection === "desc" }] : [],
  );

  const tableData = useMemo(() => data ?? [], [data]);

  const table = useReactTable<T>({
    data: tableData,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const sortedItems = useMemo(() => sortedRows.map((r) => r.original), [sortedRows]);

  if (isLoading) return <TableSkeleton columnCount={columns.length} rows={5} />;

  if (isMobile && mobileCardRender) {
    return (
      <MobileCardList
        items={sortedItems}
        keyExtractor={(item) => keyExtractor(item, 0)}
        emptyMessage={emptyMessage}
        renderCard={mobileCardRender}
      />
    );
  }

  const currentSort = sorting[0];
  const sortKey = currentSort?.id ?? null;
  const sortDirection: "asc" | "desc" = currentSort?.desc ? "desc" : "asc";

  const toggleSort = (key: string) => {
    setSorting((prev) => {
      const cur = prev[0];
      if (!cur || cur.id !== key) return [{ id: key, desc: false }];
      if (!cur.desc) return [{ id: key, desc: true }];
      return [{ id: key, desc: false }];
    });
  };

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((col) =>
            col.sortable ? (
              <SortableTableHead
                key={col.key}
                sortKey={col.key}
                currentSort={sortKey}
                currentDirection={sortDirection}
                onSort={toggleSort}
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
      <TableBody>
        {sortedRows.length === 0 ? (
          <EmptyRow colSpan={columns.length} message={emptyMessage} />
        ) : (
          sortedRows.map((row) => {
            const item = row.original;
            return (
              <TableRow
                key={keyExtractor(item, row.index)}
                className={cn(onRowClick && "cursor-pointer", rowClassName?.(item))}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
              >
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
      {footer}
    </Table>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
