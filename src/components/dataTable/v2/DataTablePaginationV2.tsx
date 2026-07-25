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
  // R13-3: selector de tamaño de página; al cambiar, TanStack re-pagina y el
  // dataVersion (contenido) invalida el memo del compiler por sí solo.
  return (
    <div className="flex items-center justify-between gap-3 px-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Filas por página</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => table.setPageSize(Number(v))}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TablePagination
        page={pageIndex + 1}
        totalPages={totalPages}
        onPageChange={(p: number) => table.setPageIndex(p - 1)}
      />
    </div>
  );
}
