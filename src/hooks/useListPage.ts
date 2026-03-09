import { useSort } from "@/hooks/useSort";
import { usePagination } from "@/hooks/usePagination";
import { useIsMobile } from "@/hooks/use-mobile";

interface UseListPageOptions<T> {
  defaultSortKey?: string;
  defaultSortDirection?: "asc" | "desc";
  accessors?: Record<string, (item: T) => any>;
}

/**
 * Combines useSort + usePagination + useIsMobile into a single hook
 * for list pages that follow the standard pattern.
 * 
 * Pass pre-filtered items for pages with custom filtering logic.
 */
export function useListPage<T>(
  items: T[] | undefined,
  options: UseListPageOptions<T> = {}
) {
  const { sortKey, sortDirection, toggleSort, sortedItems } = useSort(items, {
    defaultKey: options.defaultSortKey,
    defaultDirection: options.defaultSortDirection,
    accessors: options.accessors,
  });

  const { page, setPage, totalPages, totalItems, paginatedItems } = usePagination(sortedItems);
  const isMobile = useIsMobile();

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
