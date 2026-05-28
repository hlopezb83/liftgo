import { useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

interface UseListFiltersOptions<T> {
  searchFields: (keyof T)[];
  /**
   * Optional accessors to search inside derived/joined fields
   * (e.g. `(r) => r.customers?.name`). Each accessor returns a string
   * to be matched against the search query.
   */
  searchAccessors?: ((item: T) => string | null | undefined)[];
  statusField?: keyof T;
  searchParam?: string;
  statusParam?: string;
}

export function useListFilters<T extends Record<string, unknown>>(
  items: T[] | undefined,
  options: UseListFiltersOptions<T>
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Persist current search params to sessionStorage keyed by pathname
  useEffect(() => {
    const key = `list-filters:${location.pathname}`;
    const qs = searchParams.toString();
    if (qs) {
      sessionStorage.setItem(key, qs);
    } else {
      sessionStorage.removeItem(key);
    }
  }, [searchParams, location.pathname]);
  const { searchParam = "q", statusParam = "status" } = options;

  const search = searchParams.get(searchParam) || "";
  const statusFilter = searchParams.get(statusParam) || "all";

  const setSearch = useCallback(
    (value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(searchParam, value);
        else next.delete(searchParam);
        return next;
      }, { replace: true });
    },
    [setSearchParams, searchParam]
  );

  const setStatusFilter = useCallback(
    (value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== "all") next.set(statusParam, value);
        else next.delete(statusParam);
        return next;
      }, { replace: true });
    },
    [setSearchParams, statusParam]
  );

  const filtered = useMemo(() => {
    return (items ?? []).filter((item) => {
      if (options.statusField && statusFilter !== "all") {
        if (item[options.statusField] !== statusFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const fieldMatch = options.searchFields.some((field) => {
          const val = item[field];
          return typeof val === "string" && val.toLowerCase().includes(q);
        });
        if (fieldMatch) return true;
        const accessorMatch = options.searchAccessors?.some((acc) => {
          const val = acc(item);
          return typeof val === "string" && val.toLowerCase().includes(q);
        });
        return Boolean(accessorMatch);
      }
      return true;
    });
    // Config options (searchFields, searchAccessors, statusField) son literales por callsite.
    // Incluirlos en deps causa nueva referencia de `filtered` en cada render → cascada que
    // dispara autoResetPageIndex de TanStack Table en loop infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, statusFilter]);

  return { search, setSearch, statusFilter, setStatusFilter, filtered };
}
