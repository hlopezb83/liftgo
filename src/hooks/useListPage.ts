import { useMemo, useState, useCallback } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { APP_CONFIG } from "@/lib/config";
import { liftgoSortingFn } from "@/components/dataTable/v2/sorting";

type SortDirection = "asc" | "desc";

interface UseListPageOptions<T> {
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  accessors?: Record<string, (item: T) => unknown>;
}

/**
 * Hook headless basado 100% en `@tanstack/react-table`: maneja sorting +
 * pagination client-side sin custom useEffect ni `useSort`/`usePagination`
 * propios. La API pública se mantiene para no romper páginas que renderizan
 * tablas manualmente con `SortableTableHead`.
 *
 * Para tablas nuevas, prefiere `useLiftgoTable` + `DataTableV2`.
 */
export function useListPage<T>(
  items: T[] | undefined,
  options: UseListPageOptions<T> = {},
) {
  const data = useMemo(() => items ?? [], [items]);
  const accessors = options.accessors;

  const columns = useMemo<ColumnDef<T>[]>(() => {
    const keys = new Set<string>();
    if (options.defaultSortKey) keys.add(options.defaultSortKey);
    if (accessors) Object.keys(accessors).forEach((k) => keys.add(k));
    return Array.from(keys).map((key) => ({
      id: key,
      accessorFn: accessors?.[key] ?? ((row: T) => (row as Record<string, unknown>)[key]),
      sortingFn: liftgoSortingFn,
    }));
  }, [accessors, options.defaultSortKey]);

  const [sorting, setSorting] = useState<SortingState>(
    options.defaultSortKey
      ? [{ id: options.defaultSortKey, desc: options.defaultSortDirection === "desc" }]
      : [],
  );
  const [pageIndex, setPageIndex] = useState(0);

  const table = useReactTable<T>({
    data,
    columns,
    state: {
      sorting,
      pagination: { pageIndex, pageSize: APP_CONFIG.PAGE_SIZE },
    },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize: APP_CONFIG.PAGE_SIZE })
          : updater;
      setPageIndex(next.pageIndex);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const sortKey = sorting[0]?.id ?? null;
  const sortDirection: SortDirection = sorting[0]?.desc ? "desc" : "asc";

  const toggleSort = useCallback((key: string) => {
    setSorting((prev) => {
      const current = prev[0];
      if (!current || current.id !== key) return [{ id: key, desc: false }];
      if (!current.desc) return [{ id: key, desc: true }];
      return [{ id: key, desc: false }];
    });
  }, []);

  const totalItems = data.length;
  const totalPages = Math.max(1, table.getPageCount());
  const paginatedItems = table.getRowModel().rows.map((r) => r.original);
  const page = pageIndex + 1;
  const setPage = useCallback((p: number) => setPageIndex(Math.max(0, p - 1)), []);

  const isMobile = useIsTabletOrBelow();

  return {
    sortKey,
    sortDirection,
    toggleSort,
    page,
    setPage,
    totalPages,
    totalItems,
    paginatedItems,
    isMobile,
  };
}
