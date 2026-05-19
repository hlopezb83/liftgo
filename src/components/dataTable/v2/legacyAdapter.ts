import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ColumnAlign, LiftgoColumnMeta } from "./types";

/**
 * Forma legacy de columnas usada en consumidores migrados desde el
 * antiguo `DataTable`. Se traduce 1-a-1 a `ColumnDef<T>` de TanStack.
 */
export interface LegacyColumn<T> {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  accessor?: (item: T) => unknown;
  render: (item: T, index: number) => ReactNode;
  align?: ColumnAlign;
  className?: string;
  headClassName?: string;
  hideOnMobile?: boolean;
}

/**
 * Convierte columnas legacy en ColumnDef nativo de TanStack.
 * Sin lógica de orden/filtrado custom — TanStack maneja todo vía
 * el `liftgoSortingFn` registrado en `useLiftgoTable`.
 */
export function toColumnDefs<T>(columns: LegacyColumn<T>[]): ColumnDef<T>[] {
  return columns.map((col) => ({
    id: col.key,
    header: () => col.label,
    enableSorting: !!col.sortable,
    accessorFn:
      col.accessor ??
      ((row: T) => (row as Record<string, unknown>)[col.key]),
    cell: ({ row }) => col.render(row.original, row.index),
    meta: {
      align: col.align,
      headClassName: col.headClassName,
      cellClassName: col.className,
      hideOnMobile: col.hideOnMobile,
    } satisfies LiftgoColumnMeta,
  }));
}
