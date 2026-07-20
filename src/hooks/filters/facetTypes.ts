// Tipos públicos de facetas para useTableFilters. Extraídos para permitir
// helpers puros (normalizeValue, applyFacetFilters) sin importar el hook.

export type TextFacet<T> = {
  type: "text";
  placeholder?: string;
  fields?: (keyof T)[];
  accessors?: ((item: T) => string | null | undefined)[];
};

export type EnumFacet<T, V extends string = string> = {
  type: "enum";
  field?: keyof T;
  accessor?: (item: T) => V | null | undefined;
  options: readonly V[];
  ui?: "tabs" | "select";
};

export type MonthFacet<T> = {
  type: "month";
  accessor: (item: T) => string | null | undefined;
};

export type DateRangeFacet<T> = {
  type: "dateRange";
  accessor: (item: T) => string | null | undefined;
};

export type EntityRefFacet<T> = {
  type: "entityRef";
  field?: keyof T;
  accessor?: (item: T) => string | null | undefined;
};

export type Facet<T> =
  | TextFacet<T>
  | EnumFacet<T>
  | MonthFacet<T>
  | DateRangeFacet<T>
  | EntityRefFacet<T>;
