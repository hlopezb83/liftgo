import { useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";

interface UseListFiltersOptions<T> {
  searchFields: (keyof T)[];
  statusField?: keyof T;
  searchParam?: string;
  statusParam?: string;
}

export function useListFilters<T extends Record<string, any>>(
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
    return items?.filter((item) => {
      if (options.statusField && statusFilter !== "all") {
        if (item[options.statusField] !== statusFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return options.searchFields.some((field) => {
          const val = item[field];
          return typeof val === "string" && val.toLowerCase().includes(q);
        });
      }
      return true;
    });
  }, [items, search, statusFilter, options.searchFields, options.statusField]);

  return { search, setSearch, statusFilter, setStatusFilter, filtered };
}
