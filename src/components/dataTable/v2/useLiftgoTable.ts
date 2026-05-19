import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type PaginationState,
  type Table,
} from "@tanstack/react-table";
import { APP_CONFIG } from "@/lib/config";
import { liftgoSortingFn } from "./sorting";

interface Options<T> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  getRowId: (row: T, index: number) => string;
  initialSorting?: SortingState;
  initialPageSize?: number;
  enableRowSelection?: boolean | ((row: T) => boolean);
  globalFilter?: string;
  paginated?: boolean;
}

export function useLiftgoTable<T>({
  data,
  columns,
  getRowId,
  initialSorting = [],
  initialPageSize = APP_CONFIG.PAGE_SIZE,
  enableRowSelection = false,
  globalFilter,
  paginated = true,
}: Options<T>): Table<T> {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const tableData = useMemo(() => data ?? [], [data]);

  const columnsWithSortFn = useMemo<ColumnDef<T>[]>(
    () =>
      columns.map((col) => ({
        sortingFn: liftgoSortingFn,
        ...col,
      })),
    [columns],
  );

  return useReactTable<T>({
    data: tableData,
    columns: columnsWithSortFn,
    state: {
      sorting,
      rowSelection,
      ...(paginated ? { pagination } : {}),
      ...(globalFilter !== undefined ? { globalFilter } : {}),
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: paginated ? setPagination : undefined,
    enableRowSelection:
      typeof enableRowSelection === "function"
        ? (row) => (enableRowSelection as (r: T) => boolean)(row.original)
        : enableRowSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
  });
}
