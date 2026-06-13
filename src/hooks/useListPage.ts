import { useMemo, useCallback } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { useIsTabletOrBelow } from "@/hooks/use-mobile";
import { useLiftgoTable } from "@/components/dataTable/v2/useLiftgoTable";

type SortDirection = "asc" | "desc";

interface UseListPageOptions<T> {
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  accessors?: Record<string, (item: T) => unknown>;
}

/**
 * Hook headless que delega 100% del motor de tabla en `useLiftgoTable`
 * (única fuente de verdad para TanStack en LiftGo). Expone una API plana
 * (sortKey, page, paginatedItems, etc.) para páginas que renderizan tablas
 * manualmente con `SortableTableHead` + `renderRow`.
 *
 * Para tablas nuevas, prefiere `useLiftgoTable` + `DataTableV2` directamente.
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
    }));
  }, [accessors, options.defaultSortKey]);

  const initialSorting = useMemo<SortingState>(
    () =>
      options.defaultSortKey
        ? [{ id: options.defaultSortKey, desc: options.defaultSortDirection === "desc" }]
        : [],
    [options.defaultSortKey, options.defaultSortDirection],
  );

  const getRowId = useCallback((_row: T, index: number) => String(index), []);

  const table = useLiftgoTable<T>({
    data,
    columns,
    getRowId,
    initialSorting,
    paginated: true,
  });

  const sortingState = table.getState().sorting;
  const sortKey = sortingState[0]?.id ?? null;
  const sortDirection: SortDirection = sortingState[0]?.desc ? "desc" : "asc";

  const toggleSort = useCallback(
    (key: string) => {
      table.setSorting((prev) => {
        const current = prev[0];
        if (!current || current.id !== key) return [{ id: key, desc: false }];
        if (!current.desc) return [{ id: key, desc: true }];
        return [{ id: key, desc: false }];
      });
    },
    [table],
  );

  const paginationState = table.getState().pagination;
  const totalItems = data.length;
  const totalPages = Math.max(1, table.getPageCount());
  const paginatedItems = table.getRowModel().rows.map((r) => r.original);
  const page = paginationState.pageIndex + 1;
  const setPage = useCallback(
    (p: number) => table.setPageIndex(Math.max(0, p - 1)),
    [table],
  );

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
