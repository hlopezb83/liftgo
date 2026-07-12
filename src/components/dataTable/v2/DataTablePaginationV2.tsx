import { TablePagination } from "@/components/feedback/TablePagination";
import type { Table } from "@tanstack/react-table";

interface Props<T> {
  table: Table<T>;
}

export function DataTablePaginationV2<T>({ table }: Props<T>) {
  const { pageIndex } = table.getState().pagination;
  const totalPages = table.getPageCount();
  return (
    <TablePagination
      page={pageIndex + 1}
      totalPages={totalPages}
      onPageChange={(p: number) => table.setPageIndex(p - 1)}
    />
  );
}
