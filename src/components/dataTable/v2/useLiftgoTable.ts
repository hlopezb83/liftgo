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
  type Updater,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
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

/**
 * Hook único para tablas LiftGo. Todo el estado (sort, filtro, paginación,
 * selección) lo administra TanStack. Sin `useEffect`s para sincronizar
 * arreglos: el sort lo hace `getSortedRowModel`, el filtro `getFilteredRowModel`,
 * la paginación `getPaginationRowModel`, y la selección la poda TanStack
 * automáticamente al cambiar `data` si `getRowId` es estable.
 */
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

  const resolveSelectable =
    typeof enableRowSelection === "function"
      ? (row: { original: T }): boolean => {
          const fn: (r: T) => boolean = enableRowSelection;
          return fn(row.original);
        }
      : enableRowSelection;

  const handleSelectionChange = (updater: Updater<RowSelectionState>): void => {
    setRowSelection((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (onSelectionChange) {
        const ids = Object.keys(next).filter((k) => next[k]);
        const rows = tableData.filter((r, i) => ids.includes(getRowId(r, i)));
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
    autoResetPageIndex: false,
    data: tableData,
    columns,
    defaultColumn: { sortingFn: liftgoSortingFn },
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
