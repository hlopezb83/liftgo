import { useState, useMemo } from "react";

const PAGE_SIZE = 25;

export function usePagination<T>(items: T[] | undefined) {
  const [page, setPage] = useState(1);

  const totalItems = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  // Reset to page 1 if current page exceeds total (e.g. after filter change)
  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    if (!items) return [];
    const start = (safePage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, safePage]);

  return {
    page: safePage,
    setPage,
    totalPages,
    totalItems,
    pageSize: PAGE_SIZE,
    paginatedItems,
  };
}
