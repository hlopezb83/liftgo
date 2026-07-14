import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { matchSorter, rankings } from "match-sorter";

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
 *   En modo `server` no toca `items`; sólo expone `values` / `queryFilters`
 *   para que el fetcher aplique los filtros antes del `.limit()`.
 */

type Storage = "url" | "session" | "memory";
type Mode = "client" | "server";

// (facet types are inferred structurally via the union `Facet<T>`)

type TextFacet<T> = {
  type: "text";
  /** Placeholder del input de búsqueda. */
  placeholder?: string;
  /** Campos escalares del item usados para búsqueda fuzzy. */
  fields?: (keyof T)[];
  /** Accessors para campos derivados/relacionados. */
  accessors?: ((item: T) => string | null | undefined)[];
};

type EnumFacet<T, V extends string = string> = {
  type: "enum";
  /** Field del item que se compara por igualdad. */
  field?: keyof T;
  /** Accessor alternativo (si el valor no es una prop directa). */
  accessor?: (item: T) => V | null | undefined;
  /** Opciones válidas (además de "all"). Se usan también para validación. */
  options: readonly V[];
  /** UI sugerida — la barra decide tabs vs select según el conteo. */
  ui?: "tabs" | "select";
};

type MonthFacet<T> = {
  type: "month";
  /** Devuelve una fecha ISO (YYYY-MM-DD…) sobre la que se extrae YYYY-MM. */
  accessor: (item: T) => string | null | undefined;
};

type DateRangeFacet<T> = {
  type: "dateRange";
  accessor: (item: T) => string | null | undefined;
};

type EntityRefFacet<T> = {
  type: "entityRef";
  /** Field escalar (typ. `_id`) del item. */
  field?: keyof T;
  accessor?: (item: T) => string | null | undefined;
};

export type Facet<T> =
  | TextFacet<T>
  | EnumFacet<T>
  | MonthFacet<T>
  | DateRangeFacet<T>
  | EntityRefFacet<T>;

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
  /** String estable derivado de los primitivos — apto para queryKey / memo deps. */
  filterKey: string;
  /** Sólo en modo `client`: items filtrados según todas las facetas. */
  filtered: T[];
  /** Sólo en modo `server`: mismos primitivos que `values` (helper explícito). */
  queryFilters: FacetValues<F>;
  /** True mientras el filtro está siendo diferido por `useDeferredValue`. */
  isStale: boolean;
  /** Introspección para la toolbar: qué facetas están declaradas. */
  facets: F;
}

const DEFAULT_VALUE = "all";
const TEXT_DEFAULT = "";
const DATERANGE_DEFAULT = "";

function defaultForFacet(facet: Facet<unknown>): string {
  switch (facet.type) {
    case "text":
      return TEXT_DEFAULT;
    case "dateRange":
      return DATERANGE_DEFAULT;
    default:
      return DEFAULT_VALUE;
  }
}

function normalizeEnumValue(
  raw: string | null,
  facet: EnumFacet<unknown>,
): string {
  if (!raw || raw === "all") return "all";
  return (facet.options as readonly string[]).includes(raw) ? raw : "all";
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;

function normalizeValue(raw: string | null, facet: Facet<unknown>): string {
  if (raw == null) return defaultForFacet(facet);
  switch (facet.type) {
    case "text":
      return raw.trim();
    case "enum":
      return normalizeEnumValue(raw, facet as EnumFacet<unknown>);
    case "month":
      return YM_RE.test(raw) ? raw : "all";
    case "dateRange": {
      // Format: "from..to" | "from.." | "..to"
      if (!raw.includes("..")) return "";
      const [from, to] = raw.split("..", 2);
      const f = from && YMD_RE.test(from) ? from : "";
      const t = to && YMD_RE.test(to) ? to : "";
      return f || t ? `${f}..${t}` : "";
    }
    case "entityRef":
      return raw || "all";
  }
}

function readSessionParams(pathname: string): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  const raw = window.sessionStorage.getItem(`list-filters:${pathname}`);
  return new URLSearchParams(raw ?? "");
}

function writeSessionParams(pathname: string, params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const key = `list-filters:${pathname}`;
  const qs = params.toString();
  if (qs) window.sessionStorage.setItem(key, qs);
  else window.sessionStorage.removeItem(key);
}

/**
 * Serializa el rango de fechas de vuelta a "from..to" preservando huecos.
 */
export function serializeDateRange(from?: string, to?: string): string {
  const f = from && YMD_RE.test(from) ? from : "";
  const t = to && YMD_RE.test(to) ? to : "";
  if (!f && !t) return "";
  return `${f}..${t}`;
}

export function parseDateRange(value: string): { from?: string; to?: string } {
  if (!value.includes("..")) return {};
  const [from, to] = value.split("..", 2);
  return {
    from: from && YMD_RE.test(from) ? from : undefined,
    to: to && YMD_RE.test(to) ? to : undefined,
  };
}

export function useTableFilters<T, F extends Record<string, Facet<T>>>(
  options: UseTableFiltersOptions<T, F>,
): UseTableFiltersResult<T, F> {
  const {
    facets,
    items,
    storage = "url",
    mode = "client",
    storageKey,
  } = options;

  const location = useLocation();
  const navigate = useNavigate();

  const prefix = storageKey ? `${storageKey}.` : "";

  // Lectura del "raw" desde storage. URL es fuente de verdad; session hidrata
  // en primer render vía useEffect (ver más abajo).
  const rawParams = useMemo(() => {
    if (storage === "memory") return new URLSearchParams();
    if (storage === "session") return readSessionParams(location.pathname);
    return new URLSearchParams(location.search);
  }, [storage, location.pathname, location.search]);

  // Valores normalizados — SIEMPRE primitivos, siempre presentes.
  const values = useMemo(() => {
    const out = {} as FacetValues<F>;
    for (const key of Object.keys(facets) as (keyof F)[]) {
      const facet = facets[key] as Facet<T>;
      const raw = rawParams.get(`${prefix}${String(key)}`);
      (out as Record<string, string>)[String(key)] = normalizeValue(raw, facet);
    }
    return out;
  }, [rawParams, facets, prefix]);

  // Persistencia de URL <-> session (para que "volver a la lista" restaure).
  useEffect(() => {
    if (storage !== "url") return;
    writeSessionParams(location.pathname, new URLSearchParams(location.search));
  }, [storage, location.pathname, location.search]);

  const setRaw = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      if (storage === "memory") {
        // No-op: memory mode requires a caller-provided state store which we
        // intentionally don't offer here. Prefer "url" or "session".
        return;
      }
      if (storage === "session") {
        const next = readSessionParams(location.pathname);
        mutate(next);
        writeSessionParams(location.pathname, next);
        // Force rerender via navigate replace (no-op on URL).
        navigate({ pathname: location.pathname, search: location.search }, { replace: true });
        return;
      }
      const next = new URLSearchParams(location.search);
      mutate(next);
      const qs = next.toString();
      navigate(
        { pathname: location.pathname, search: qs ? `?${qs}` : "" },
        { replace: true },
      );
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
      for (const key of Object.keys(facets)) {
        next.delete(`${prefix}${key}`);
      }
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

  // React 19 + React Compiler: dependemos SOLO de primitivos (`filterKey`,
  // `itemsVersion`) para invalidar el memo. `values` y `facets` se leen desde
  // refs para no forzar identidad de objeto en las deps — el mismo patrón
  // que resolvió la regresión de v7.61.10 en `useInvoices`.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const facetsRef = useRef(facets);
  facetsRef.current = facets;

  const deferredKey = useDeferredValue(filterKey);
  const isStale = deferredKey !== filterKey;

  // Huella primitiva de `items` — length + primer/último id (si existe).
  const itemsVersion = useMemo(() => {
    const src = items ?? [];
    if (!src.length) return "0";
    const first = src[0] as unknown as { id?: string | number };
    const last = src[src.length - 1] as unknown as { id?: string | number };
    return `${src.length}|${first?.id ?? ""}|${last?.id ?? ""}`;
  }, [items]);

  const filtered = useMemo<T[]>(() => {
    if (mode !== "client") return [];
    const source = items ?? [];
    if (!source.length) return [];
    const currentValues = valuesRef.current as Record<string, string>;
    const currentFacets = facetsRef.current as Record<string, Facet<T>>;

    // Fase 1: facetas de igualdad + mes + rango.
    let base = source;
    for (const key of Object.keys(currentFacets)) {
      const facet = currentFacets[key];
      const value = currentValues[key];
      if (!value || value === defaultForFacet(facet)) continue;

      switch (facet.type) {
        case "enum": {
          const f = facet as EnumFacet<T>;
          base = base.filter((it) => {
            const v =
              f.accessor?.(it) ??
              (f.field ? ((it as Record<string, unknown>)[f.field as string] as string | null | undefined) : undefined);
            return v === value;
          });
          break;
        }
        case "month": {
          const f = facet as MonthFacet<T>;
          base = base.filter((it) => (f.accessor(it) ?? "").startsWith(value));
          break;
        }
        case "dateRange": {
          const f = facet as DateRangeFacet<T>;
          const { from, to } = parseDateRange(value);
          if (!from && !to) break;
          base = base.filter((it) => {
            const v = f.accessor(it);
            if (!v) return false;
            if (from && v < from) return false;
            if (to && v > `${to}\uFFFF`) return false;
            return true;
          });
          break;
        }
        case "entityRef": {
          const f = facet as EntityRefFacet<T>;
          base = base.filter((it) => {
            const v =
              f.accessor?.(it) ??
              (f.field ? ((it as Record<string, unknown>)[f.field as string] as string | null | undefined) : undefined);
            return v === value;
          });
          break;
        }
        default:
          break;
      }
    }

    // Fase 2: text facets — matchSorter con ranking CONTAINS.
    for (const key of Object.keys(currentFacets)) {
      const facet = currentFacets[key];
      if (facet.type !== "text") continue;
      const query = currentValues[key];
      if (!query) continue;
      const f = facet as TextFacet<T>;
      const keys = [
        ...(f.fields ?? []).map((field) => (item: T) => {
          const val = (item as Record<string, unknown>)[field as string];
          return typeof val === "string" ? val : "";
        }),
        ...(f.accessors ?? []).map((acc) => (item: T) => acc(item) ?? ""),
      ];
      base = matchSorter(base, query, {
        keys,
        threshold: rankings.CONTAINS,
        baseSort: (a, b) => a.index - b.index,
      });
    }

    return base;
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
