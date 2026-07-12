import { useMemo, useCallback, useEffect, useDeferredValue } from "react";
import { useSearchParams, useLocation } from "react-router";
import { matchSorter, rankings } from "match-sorter";

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
  const {
    searchFields,
    searchAccessors,
    statusField,
    searchParam = "q",
    statusParam = "status",
  } = options;

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

  // React 19: diferimos search y statusFilter para que el input responda instantáneo
  // mientras el filtrado sobre listas grandes se computa en una render de baja prioridad.
  const deferredSearch = useDeferredValue(search);
  const deferredStatus = useDeferredValue(statusFilter);

  const filtered = useMemo(() => {
    // Paso 1: filtro por status (equality trivial, no requiere librería).
    const base = (items ?? []).filter((item) => {
      if (statusField && deferredStatus !== "all") {
        return item[statusField] === deferredStatus;
      }
      return true;
    });

    // Paso 2: búsqueda por texto vía `match-sorter`.
    // Preservamos el orden original con `baseSort` indexado para evitar
    // reordenamientos inesperados en tablas que ya ordenan por su cuenta.
    if (!deferredSearch) return base;

    const keys = [
      ...searchFields.map((field) => (item: T) => {
        const val = item[field];
        return typeof val === "string" ? val : "";
      }),
      ...(searchAccessors ?? []).map((acc) => (item: T) => acc(item) ?? ""),
    ];

    return matchSorter(base, deferredSearch, {
      keys,
      threshold: rankings.CONTAINS,
      baseSort: (a, b) => a.index - b.index,
    });
  }, [items, deferredSearch, deferredStatus, searchFields, searchAccessors, statusField]);

  const isStale = deferredSearch !== search || deferredStatus !== statusFilter;

  return { search, setSearch, statusFilter, setStatusFilter, filtered, isStale };
}
