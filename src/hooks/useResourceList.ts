import { useMemo } from "react";
import { useLiftgoTable } from "@/components/dataTable/v2/useLiftgoTable";
import { useListFilters } from "@/hooks/useListFilters";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

interface FilterConfig<T> {
  searchFields: (keyof T)[];
  searchAccessors?: ((item: T) => string | null | undefined)[];
  statusField?: keyof T;
  searchParam?: string;
  statusParam?: string;
}

interface UseResourceListOptions<T extends Record<string, unknown>> {
  items: T[] | undefined;
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  initialSorting?: SortingState;
  filters?: FilterConfig<T>;
  /**
   * Si se proporciona, omite el filtrado interno y usa este arreglo como fuente
   * de la tabla. Útil cuando la página tiene un hook de filtros propio
   * (p.ej. con rango de fechas).
   */
  externalFiltered?: T[];
}

/**
 * Empaqueta el quinteto (filtros + sort + paginación vía tabla) usado por
 * todas las páginas de listado. Reduce ~5 líneas de boilerplate por página
 * y centraliza las decisiones por defecto (sort inicial, paginación).
 */
export function useResourceList<T extends Record<string, unknown>>(
  options: UseResourceListOptions<T>,
) {
  const { items, columns, getRowId, initialSorting, filters, externalFiltered } =
    options;

  const internal = useListFilters<T>(items, filters ?? { searchFields: [] });

  const filtered = useMemo(
    () => externalFiltered ?? internal.filtered,
    [externalFiltered, internal.filtered],
  );

  const table = useLiftgoTable<T>({
    data: filtered,
    columns,
    getRowId,
    initialSorting,
  });

  return {
    search: internal.search,
    setSearch: internal.setSearch,
    statusFilter: internal.statusFilter,
    setStatusFilter: internal.setStatusFilter,
    filtered,
    table,
  };
}
