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

import type { DataTableSelectionContext } from "./types";

interface Options<T> {
  data: T[] | undefined;
  columns: ColumnDef<T>[];
  getRowId: (row: T, index: number) => string;
  initialSorting?: SortingState;
  initialPageSize?: number;
  enableRowSelection?: boolean | ((row: T) => boolean);
  globalFilter?: string;
  paginated?: boolean;
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
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
  onSelectionChange,
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
        sortingFn: liftgoSortingFn<T>,
        ...col,
      })),
    [columns],
  );

  const resolveSelectable =
    typeof enableRowSelection === "function"
      ? (row: { original: T }) => {
          const fn: (r: T) => boolean = enableRowSelection;
          return fn(row.original);
        }
      : enableRowSelection;

  // Ref para acceder a la data más reciente sin causar re-render del callback
  const dataRef = useRef(tableData);
  dataRef.current = tableData;

  const handleSelectionChange = (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => {
    setRowSelection((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (onSelectionChange) {
        const ids = Object.keys(next).filter((k) => next[k]);
        const rows = dataRef.current.filter((r, i) => ids.includes(getRowId(r, i)));
        onSelectionChange({
          selectedIds: ids,
          selectedRows: rows,
          clearSelection: () => setRowSelection({}),
        });
      }
      return next;
    });
  };

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
    onRowSelectionChange: handleSelectionChange,
    onPaginationChange: paginated ? setPagination : undefined,
    enableRowSelection: resolveSelectable,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
  });
}
