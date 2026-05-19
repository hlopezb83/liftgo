import { useMemo, useState } from "react";
import { useQuery, keepPreviousData, type QueryKey } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type RowSelectionState,
  type Table,
  type Updater,
} from "@tanstack/react-table";
import { APP_CONFIG } from "@/lib/config";
import type { DataTableSelectionContext } from "./types";

export interface ServerLiftgoTableQuery {
  pageIndex: number;
  pageSize: number;
  sorting: SortingState;
  globalFilter: string;
}

export interface ServerLiftgoTableResult<T> {
  rows: T[];
  total: number;
}

export type ServerLiftgoTableFetcher<T> = (q: ServerLiftgoTableQuery) => Promise<ServerLiftgoTableResult<T>>;

interface Options<T> {
  queryKey: QueryKey;
  fetcher: ServerLiftgoTableFetcher<T>;
  columns: ColumnDef<T>[];
  getRowId: (row: T, index: number) => string;
  initialSorting?: SortingState;
  initialPageSize?: number;
  globalFilter?: string;
  enableRowSelection?: boolean | ((row: T) => boolean);
  onSelectionChange?: (ctx: DataTableSelectionContext<T>) => void;
  staleTime?: number;
}

/**
 * Hook server-side de TanStack para listas grandes en Supabase.
 * Traduce sorting / pagination / globalFilter a una query externa
 * (típicamente `.order()`, `.range()`, `.ilike()` + `count: 'exact'`).
 *
 * Uso típico:
 *   const { table, isLoading } = useServerLiftgoTable<Booking>({
 *     queryKey: ["bookings", "page", ...],
 *     fetcher: async ({ pageIndex, pageSize, sorting, globalFilter }) => {
 *       const from = pageIndex * pageSize;
 *       const to = from + pageSize - 1;
 *       let q = supabase.from("bookings").select("*", { count: "exact" }).range(from, to);
 *       sorting.forEach(s => { q = q.order(s.id, { ascending: !s.desc }); });
 *       if (globalFilter) q = q.ilike("customer_name", `%${globalFilter}%`);
 *       const { data, count, error } = await q;
 *       if (error) throw error;
 *       return { rows: data ?? [], total: count ?? 0 };
 *     },
 *     columns,
 *     getRowId: (b) => b.id,
 *   });
 */
export function useServerLiftgoTable<T>({
  queryKey,
  fetcher,
  columns,
  getRowId,
  initialSorting = [],
  initialPageSize = APP_CONFIG.PAGE_SIZE,
  globalFilter = "",
  enableRowSelection = false,
  onSelectionChange,
  staleTime = 30_000,
}: Options<T>): { table: Table<T>; isLoading: boolean; isFetching: boolean; total: number } {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: initialPageSize });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const query = useQuery({
    queryKey: [...queryKey, pagination.pageIndex, pagination.pageSize, sorting, globalFilter],
    queryFn: () => fetcher({ pageIndex: pagination.pageIndex, pageSize: pagination.pageSize, sorting, globalFilter }),
    placeholderData: keepPreviousData,
    staleTime,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

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
        const selectedRows = rows.filter((r, i) => ids.includes(getRowId(r, i)));
        onSelectionChange({ selectedIds: ids, selectedRows, clearSelection: () => setRowSelection({}) });
      }
      return next;
    });
  };

  const table = useReactTable<T>({
    data: rows,
    columns,
    state: { sorting, pagination, rowSelection, globalFilter },
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    pageCount,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: handleSelectionChange,
    enableRowSelection: resolveSelectable,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
  });

  return { table, isLoading: query.isLoading, isFetching: query.isFetching, total };
}
