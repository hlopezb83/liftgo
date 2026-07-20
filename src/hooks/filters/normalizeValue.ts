// Helpers puros para normalizar valores crudos (URL/session) hacia primitivos
// validados por facet. Extraído de useTableFilters para limitar complejidad.

import type { Facet, EnumFacet } from "./facetTypes";

export const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
export const YM_RE = /^\d{4}-\d{2}$/;

const DEFAULT_VALUE = "all";
const TEXT_DEFAULT = "";
const DATERANGE_DEFAULT = "";

export function defaultForFacet<T>(facet: Facet<T>): string {
  switch (facet.type) {
    case "text":
      return TEXT_DEFAULT;
    case "dateRange":
      return DATERANGE_DEFAULT;
    default:
      return DEFAULT_VALUE;
  }
}

function normalizeEnumValue<T>(raw: string | null, facet: EnumFacet<T>): string {
  if (!raw || raw === "all") return "all";
  return (facet.options as readonly string[]).includes(raw) ? raw : "all";
}

function normalizeDateRange(raw: string): string {
  if (!raw.includes("..")) return "";
  const [from, to] = raw.split("..", 2);
  const f = from && YMD_RE.test(from) ? from : "";
  const t = to && YMD_RE.test(to) ? to : "";
  return f || t ? `${f}..${t}` : "";
}

export function normalizeValue<T>(raw: string | null, facet: Facet<T>): string {
  if (raw == null) return defaultForFacet(facet);
  switch (facet.type) {
    case "text":
      return raw.trim();
    case "enum":
      return normalizeEnumValue(raw, facet);
    case "month":
      return YM_RE.test(raw) ? raw : "all";
    case "dateRange":
      return normalizeDateRange(raw);
    case "entityRef":
      return raw || "all";
  }
}

export function parseDateRange(value: string): { from?: string; to?: string } {
  if (!value.includes("..")) return {};
  const [from, to] = value.split("..", 2);
  return {
    from: from && YMD_RE.test(from) ? from : undefined,
    to: to && YMD_RE.test(to) ? to : undefined,
  };
}
