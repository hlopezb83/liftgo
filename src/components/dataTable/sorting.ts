import type { SortingFn, Row } from "@tanstack/react-table";

/**
 * Comparador estándar del DataTable: nulls al final, números nativos,
 * strings con localeCompare insensible a acentos y numeric:true.
 */
export const liftgoSortingFn: SortingFn<unknown> = (rowA: Row<unknown>, rowB: Row<unknown>, columnId: string) => {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
};

export const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export type ColumnAlign = keyof typeof alignClass;
