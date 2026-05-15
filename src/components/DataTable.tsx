import { ReactNode, useMemo, useState, useEffect, useRef, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type SortingFn,
  type Row,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
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

export interface DataTableSelectionContext<T> {
  selectedIds: string[];
  selectedRows: T[];
  clearSelection: () => void;
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
  // --- Selección múltiple (opt-in) ---
  enableRowSelection?: boolean;
  isRowSelectable?: (item: T) => boolean;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
  selectionToolbar?: (ctx: DataTableSelectionContext<T>) => ReactNode;
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
  enableRowSelection = false,
  isRowSelectable,
  onSelectionChange,
  selectionToolbar,
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
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const tableData = useMemo(() => data ?? [], [data]);

  const table = useReactTable<T>({
    data: tableData,
    columns: columnDefs,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: enableRowSelection
      ? (row) => (isRowSelectable ? isRowSelectable(row.original) : true)
      : false,
    getRowId: (row, index) => keyExtractor(row, index),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const sortedItems = useMemo(() => sortedRows.map((r) => r.original), [sortedRows]);

  const selectedIds = useMemo(() => Object.keys(rowSelection).filter((k) => rowSelection[k]), [rowSelection]);
  const selectedRows = useMemo(
    () => table.getSelectedRowModel().rows.map((r) => r.original),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowSelection, sortedRows],
  );

  const clearSelection = () => setRowSelection({});

  // Notificar selección al padre con stable signature
  const lastNotifiedRef = useRef<string>("");
  useEffect(() => {
    if (!enableRowSelection || !onSelectionChange) return;
    const sig = selectedIds.join("|");
    if (sig === lastNotifiedRef.current) return;
    lastNotifiedRef.current = sig;
    onSelectionChange({ selectedIds, selectedRows, clearSelection });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, selectedRows, enableRowSelection]);

  // Limpiar selección de filas que ya no existen en el dataset (ej: al filtrar)
  useEffect(() => {
    if (!enableRowSelection) return;
    const validIds = new Set(tableData.map((row, i) => keyExtractor(row, i)));
    const next: RowSelectionState = {};
    let changed = false;
    for (const id of Object.keys(rowSelection)) {
      if (validIds.has(id) && rowSelection[id]) next[id] = true;
      else changed = true;
    }
    if (changed) setRowSelection(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableData, enableRowSelection]);

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

  const showSelection = enableRowSelection;
  const selectableRows = showSelection ? sortedRows.filter((r) => r.getCanSelect()) : [];
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => r.getIsSelected());
  const someSelected = selectableRows.some((r) => r.getIsSelected()) && !allSelected;
  const headerCheckedState: boolean | "indeterminate" = allSelected ? true : someSelected ? "indeterminate" : false;

  const toolbar =
    showSelection && selectionToolbar && selectedIds.length > 0
      ? selectionToolbar({ selectedIds, selectedRows, clearSelection })
      : null;

  return (
    <div className="space-y-2">
      {toolbar}
      <Table className={className}>
        <TableHeader>
          <TableRow>
            {showSelection && (
              <TableHead className="w-10 px-3">
                <Checkbox
                  checked={headerCheckedState}
                  onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
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
            <EmptyRow colSpan={columns.length + (showSelection ? 1 : 0)} message={emptyMessage} />
          ) : (
            sortedRows.map((row) => {
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
        {footer}
      </Table>
    </div>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
