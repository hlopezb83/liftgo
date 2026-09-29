import { useCallback, useEffect, useState } from "react";
import type { PaginationState, SortingState, Updater } from "@tanstack/react-table";

interface PaginationSnapshot {
  filterKey: string;
  value: PaginationState;
}

export function useAccountsPayableTableState(filterKey: string) {
  const [snapshot, setSnapshot] = useState<PaginationSnapshot>(() => ({
    filterKey,
    value: { pageIndex: 0, pageSize: 25 },
  }));
  const [sorting, setSorting] = useState<SortingState>([]);
  const pagination = snapshot.filterKey === filterKey
    ? snapshot.value
    : { ...snapshot.value, pageIndex: 0 };

  const onPaginationChange = useCallback((updater: Updater<PaginationState>) => {
    setSnapshot((previous) => {
      const current = previous.filterKey === filterKey
        ? previous.value
        : { ...previous.value, pageIndex: 0 };
      return {
        filterKey,
        value: typeof updater === "function" ? updater(current) : updater,
      };
    });
  }, [filterKey]);

  const onSortingChange = useCallback((updater: Updater<SortingState>) => {
    setSorting((previous) => {
      const next = typeof updater === "function" ? updater(previous) : updater;
      return next.slice(0, 1);
    });
    setSnapshot((previous) => {
      const current = previous.filterKey === filterKey
        ? previous.value
        : { ...previous.value, pageIndex: 0 };
      return { filterKey, value: { ...current, pageIndex: 0 } };
    });
  }, [filterKey]);

  return { pagination, sorting, onPaginationChange, onSortingChange };
}

export function useClampAccountsPayablePage(
  totalCount: number | undefined,
  pageCount: number,
  pagination: PaginationState,
  onPaginationChange: (updater: Updater<PaginationState>) => void,
) {
  const maxPageIndex = Math.max(0, pageCount - 1);
  useEffect(() => {
    if (totalCount !== undefined && pagination.pageIndex > maxPageIndex) {
      onPaginationChange({ ...pagination, pageIndex: maxPageIndex });
    }
  }, [maxPageIndex, onPaginationChange, pagination, totalCount]);
}
