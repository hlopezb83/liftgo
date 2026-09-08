import { TablePagination } from "@/components/feedback/TablePagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Table } from "@tanstack/react-table";

interface Props<T> {
  table: Table<T>;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function DataTablePaginationV2<T>({ table }: Props<T>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const totalPages = table.getPageCount();
  // Indicador de rango: filas visibles de la página actual sobre el total
  // filtrado. Con paginación manual desactivada (getPageCount() === -1) se
  // muestran todas las filas, así que el rango cubre el total completo.
  const totalRows = table.getFilteredRowModel().rows.length;
  const isPaginated = totalPages !== -1;
  const rangeStart = totalRows === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = isPaginated ? Math.min(totalRows, (pageIndex + 1) * pageSize) : totalRows;
  // R13-3: selector de tamaño de página; al cambiar, TanStack re-pagina y el
  // dataVersion (contenido) invalida el memo del compiler por sí solo.
  return (
    // R24-B: el paginador no se imprime (la tabla sale completa multipágina).
    // V26-01: a 320/390px el pie no cabía en una sola fila (scrollWidth 541 >
    // clientWidth 380) y "Siguiente" quedaba fuera de pantalla. En móvil se
    // apila selector+rango sobre la navegación; desde `sm` vuelve a una fila.
    <div className="flex flex-col gap-2 px-2 no-print sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="whitespace-nowrap">Filas por página</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => table.setPageSize(Number(v))}
        >
          {/* R6-FE-09: h-8 = 32px; en táctil sube a 44px. */}
          <SelectTrigger className="h-8 w-[70px] touch:h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="whitespace-nowrap">
          {rangeStart}–{rangeEnd} de {totalRows}
        </span>
      </div>
      <TablePagination
        page={pageIndex + 1}
        totalPages={totalPages}
        onPageChange={(p: number) => table.setPageIndex(p - 1)}
      />
    </div>
  );
}
