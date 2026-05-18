import { useMemo, useState, useEffect, useRef, memo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type SortingFn,
  type RowSelectionState,
} from "@tanstack/react-table";
import { Table } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { MobileCardList } from "@/components/MobileCardList";
import { useIsMobile } from "@/hooks/use-mobile";
import { liftgoSortingFn } from "./dataTable/sorting";
import { DataTableHeader } from "./dataTable/DataTableHeader";
import { DataTableBody } from "./dataTable/DataTableBody";
import type { DataTableProps } from "./dataTable/types";

export type { DataTableColumn, DataTableProps, DataTableSelectionContext } from "./dataTable/types";
export type { ColumnAlign } from "./dataTable/sorting";

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
        <DataTableHeader
          columns={columns}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onToggleSort={toggleSort}
          showSelection={showSelection}
          headerCheckedState={headerCheckedState}
          onToggleAll={(value) => table.toggleAllRowsSelected(value)}
        />
        <DataTableBody
          rows={sortedRows}
          columns={columns}
          emptyMessage={emptyMessage}
          showSelection={showSelection}
          onRowClick={onRowClick}
          rowClassName={rowClassName}
        />
        {footer}
      </Table>
    </div>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
