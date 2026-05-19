import type { Row, SortingFn } from "@tanstack/react-table";

/**
 * Comparador estándar LiftGo: nulls al final, números nativos,
 * strings con localeCompare insensible a acentos y numeric:true.
 * Genérico para alinear con `SortingFn<T>` que pide TanStack por columna.
 */
export function liftgoSortingFn<T>(
  rowA: Row<T>,
  rowB: Row<T>,
  columnId: string,
): number {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}
// Exporta también con la firma "anchurada" cuando se necesite el tipo SortingFn<unknown>.
export const liftgoSortingFnUnknown: SortingFn<unknown> = liftgoSortingFn;

export const alignClass: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};
