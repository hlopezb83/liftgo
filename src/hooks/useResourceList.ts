import { useLiftgoTable } from "@/components/dataTable/v2/useLiftgoTable";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

interface UseResourceListOptions<T extends Record<string, unknown>> {
  /** Datos ya filtrados por el hook canónico de la página (`useTableFilters`). */
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  initialSorting?: SortingState;
  /** Token primitivo que reinicia la paginación cuando cambian los filtros. */
  tableResetKey?: string | number;
}

/**
 * Thin wrapper alrededor de `useLiftgoTable`.
 *
 * Sprint G (v7.69.0): esta utilería dejó de filtrar internamente. Cada página
 * es responsable de producir su `data` filtrada vía `useTableFilters` (u otro
 * hook canónico) antes de pasarla aquí. Con ello retiramos `useListFilters`.
 */
export function useResourceList<T extends Record<string, unknown>>(
  options: UseResourceListOptions<T>,
) {
  const { data, columns, getRowId, initialSorting, tableResetKey } = options;

  const table = useLiftgoTable<T>({
    data,
    columns,
    getRowId,
    initialSorting,
    resetKey: tableResetKey,
  });

  return { table };
}
