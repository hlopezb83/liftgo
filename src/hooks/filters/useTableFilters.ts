import { useCallback, useDeferredValue, useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { applyFacetFilters } from "./applyFacetFilters";
import type { Facet } from "./facetTypes";
import { defaultForFacet, normalizeValue } from "./normalizeValue";
import { readSessionParams, writeSessionParams } from "./sessionStorage";

/**
 * Contrato canónico de filtros de tabla en LiftGo.
 *
 * Reglas invariantes (ver plan v7.62.0):
 * - Storage por defecto: URL (`?q=&status=&from=&to=&month=&supplier=&<extra>`).
 * - Los valores de estado son SIEMPRE primitivos (string) o `undefined` para
 *   ser compatibles con React Compiler y con TanStack Query keys.
 * - `filterKey` es un string derivado de los primitivos — sirve como parte de
 *   una queryKey y también como dependencia estable en `useMemo`.
 * - `hasActive` y `reset` viven en el hook: ninguna página los reimplementa.
 * - En modo `client` el hook devuelve `filtered` (matchSorter + facetas).
 *   En modo `server` no toca `items`; sólo expone `values` / `queryFilters`.
 */

type Storage = "url" | "session" | "memory";
type Mode = "client" | "server";

export type { Facet } from "./facetTypes";
export { parseDateRange } from "./normalizeValue";

export interface UseTableFiltersOptions<T, F extends Record<string, Facet<T>>> {
  facets: F;
  items?: T[] | null;
  storage?: Storage;
  mode?: Mode;
  /** Prefijo opcional de storage/URL para coexistir con otras UIs. */
  storageKey?: string;
}

type FacetValue = string;
export type FacetValues<F> = { [K in keyof F]: FacetValue };

export interface UseTableFiltersResult<T, F extends Record<string, Facet<T>>> {
  values: FacetValues<F>;
  set: <K extends keyof F>(key: K, value: string) => void;
  reset: () => void;
  hasActive: boolean;
  filterKey: string;
  filtered: T[];
  queryFilters: FacetValues<F>;
  isStale: boolean;
  facets: F;
}

export function useTableFilters<T, F extends Record<string, Facet<T>>>(
  options: UseTableFiltersOptions<T, F>,
): UseTableFiltersResult<T, F> {
  const { facets, items, storage = "url", mode = "client", storageKey } = options;

  const location = useLocation();
  const navigate = useNavigateTransition();
  const prefix = storageKey ? `${storageKey}.` : "";

  const rawParams = useMemo(() => {
    if (storage === "memory") return new URLSearchParams();
    if (storage === "session") return readSessionParams(location.pathname);
    return new URLSearchParams(location.search);
  }, [storage, location.pathname, location.search]);

  const values = useMemo(() => {
    const out = {} as FacetValues<F>;
    for (const key of Object.keys(facets) as (keyof F)[]) {
      const facet = facets[key] as Facet<T>;
      const raw = rawParams.get(`${prefix}${String(key)}`);
      (out as Record<string, string>)[String(key)] = normalizeValue(raw, facet);
    }
    return out;
  }, [rawParams, facets, prefix]);

  useEffect(() => {
    if (storage !== "url") return;
    writeSessionParams(location.pathname, new URLSearchParams(location.search));
  }, [storage, location.pathname, location.search]);

  const setRaw = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      if (storage === "memory") return;
      if (storage === "session") {
        const next = readSessionParams(location.pathname);
        mutate(next);
        writeSessionParams(location.pathname, next);
        navigate({ pathname: location.pathname, search: location.search }, { replace: true });
        return;
      }
      const next = new URLSearchParams(location.search);
      mutate(next);
      const qs = next.toString();
      navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
    },
    [storage, location.pathname, location.search, navigate],
  );

  const set = useCallback(
    <K extends keyof F>(key: K, value: string) => {
      const facet = facets[key] as Facet<T>;
      const normalized = normalizeValue(value, facet);
      const dflt = defaultForFacet(facet);
      const paramKey = `${prefix}${String(key)}`;
      setRaw((next) => {
        if (!normalized || normalized === dflt) next.delete(paramKey);
        else next.set(paramKey, normalized);
      });
    },
    [facets, prefix, setRaw],
  );

  const reset = useCallback(() => {
    setRaw((next) => {
      for (const key of Object.keys(facets)) next.delete(`${prefix}${key}`);
    });
  }, [facets, prefix, setRaw]);

  const hasActive = useMemo(() => {
    return Object.keys(facets).some((key) => {
      const facet = facets[key as keyof F] as Facet<T>;
      const v = (values as Record<string, string>)[key];
      return v !== defaultForFacet(facet);
    });
  }, [facets, values]);

  const filterKey = useMemo(() => {
    return Object.keys(facets)
      .sort()
      .map((k) => `${k}=${(values as Record<string, string>)[k] || ""}`)
      .join("|");
  }, [facets, values]);

  const deferredKey = useDeferredValue(filterKey);
  const isStale = deferredKey !== filterKey;

  const itemsVersion = useMemo(() => {
    const src = items ?? [];
    if (!src.length) return "0";
    const first = src[0] as unknown as { id?: string | number };
    const last = src[src.length - 1] as unknown as { id?: string | number };
    return `${src.length}|${first?.id ?? ""}|${last?.id ?? ""}`;
  }, [items]);

  const filtered = useMemo<T[]>(() => {
    if (mode !== "client") return [];
    return applyFacetFilters(
      items ?? [],
      facets as unknown as Record<string, Facet<T>>,
      values as Record<string, string>,
    );
    // filterKey/itemsVersion son huellas primitivas de values/items; suficientes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, items, itemsVersion, filterKey]);

  return {
    values,
    set,
    reset,
    hasActive,
    filterKey,
    filtered,
    queryFilters: values,
    isStale,
    facets,
  };
}
