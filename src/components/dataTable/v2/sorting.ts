import type { Row } from "@tanstack/react-table";

/**
 * Comparador estándar LiftGo: números nativos, strings con localeCompare
 * insensible a acentos y numeric:true.
 *
 * R22-W: TanStack invierte el resultado del comparador cuando la columna está
 * en `desc`. Si los nulos devolvían siempre +1 ("al final"), al invertir
 * terminaban al principio. `createLiftgoSortingFn` recibe un predicado que
 * indica si la columna está en desc y pre-invierte el signo de los nulos para
 * que SIEMPRE queden al final, en ambos sentidos.
 */
export function createLiftgoSortingFn<T>(
  isDesc: (columnId: string) => boolean,
): (rowA: Row<T>, rowB: Row<T>, columnId: string) => number {
  return (rowA, rowB, columnId) => {
    const a = rowA.getValue(columnId);
    const b = rowB.getValue(columnId);
    if (a == null && b == null) return 0;
    if (a == null || b == null) {
      // +1 => a al final. Se pre-invierte en desc porque TanStack negará el valor.
      const last = a == null ? 1 : -1;
      return isDesc(columnId) ? -last : last;
    }
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  };
}

/** Variante ascendente (sin estado de sort). Se conserva para consumidores simples. */
export const liftgoSortingFn = createLiftgoSortingFn(() => false);

export const alignClass: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};
