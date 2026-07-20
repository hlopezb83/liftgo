// Reducer puro que aplica todas las facetas a un arreglo de items.
// Extraído de useTableFilters para bajar complejidad ciclomática del hook.

import { matchSorter, rankings } from "match-sorter";
import { defaultForFacet, parseDateRange } from "./normalizeValue";
import type {
  DateRangeFacet,
  EntityRefFacet,
  EnumFacet,
  Facet,
  MonthFacet,
  TextFacet,
} from "./facetTypes";

function readField<T>(item: T, field: string): string | null | undefined {
  return (item as Record<string, unknown>)[field] as string | null | undefined;
}

function filterEnum<T>(items: T[], facet: EnumFacet<T>, value: string): T[] {
  return items.filter((it) => {
    const v = facet.accessor?.(it) ?? (facet.field ? readField(it, facet.field as string) : undefined);
    return v === value;
  });
}

function filterMonth<T>(items: T[], facet: MonthFacet<T>, value: string): T[] {
  return items.filter((it) => (facet.accessor(it) ?? "").startsWith(value));
}

function filterDateRange<T>(items: T[], facet: DateRangeFacet<T>, value: string): T[] {
  const { from, to } = parseDateRange(value);
  if (!from && !to) return items;
  return items.filter((it) => {
    const v = facet.accessor(it);
    if (!v) return false;
    if (from && v < from) return false;
    if (to && v > `${to}\uFFFF`) return false;
    return true;
  });
}

function filterEntityRef<T>(items: T[], facet: EntityRefFacet<T>, value: string): T[] {
  return items.filter((it) => {
    const v = facet.accessor?.(it) ?? (facet.field ? readField(it, facet.field as string) : undefined);
    return v === value;
  });
}

function applyEqualityFacets<T>(
  source: T[],
  facets: Record<string, Facet<T>>,
  values: Record<string, string>,
): T[] {
  let base = source;
  for (const key of Object.keys(facets)) {
    const facet = facets[key];
    const value = values[key];
    if (!value || value === defaultForFacet(facet)) continue;
    switch (facet.type) {
      case "enum":
        base = filterEnum(base, facet, value);
        break;
      case "month":
        base = filterMonth(base, facet, value);
        break;
      case "dateRange":
        base = filterDateRange(base, facet, value);
        break;
      case "entityRef":
        base = filterEntityRef(base, facet, value);
        break;
      default:
        break;
    }
  }
  return base;
}

function applyTextFacets<T>(
  source: T[],
  facets: Record<string, Facet<T>>,
  values: Record<string, string>,
): T[] {
  let base = source;
  for (const key of Object.keys(facets)) {
    const facet = facets[key];
    if (facet.type !== "text") continue;
    const query = values[key];
    if (!query) continue;
    const f = facet as TextFacet<T>;
    const keys = [
      ...(f.fields ?? []).map((field) => (item: T) => {
        const val = readField(item, field as string);
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
}

export function applyFacetFilters<T>(
  source: T[],
  facets: Record<string, Facet<T>>,
  values: Record<string, string>,
): T[] {
  if (!source.length) return [];
  const afterEquality = applyEqualityFacets(source, facets, values);
  return applyTextFacets(afterEquality, facets, values);
}
