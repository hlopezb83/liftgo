import { memo } from "react";
import type { Table } from "@tanstack/react-table";
import { TablePagination } from "@/components/TablePagination";

interface Props<T> {
  table: Table<T>;
}

function Inner<T>({ table }: Props<T>) {
  const { pageIndex } = table.getState().pagination;
  const totalPages = table.getPageCount();
  return (
    <TablePagination
      page={pageIndex + 1}
      totalPages={totalPages}
      onPageChange={(p) => table.setPageIndex(p - 1)}
    />
  );
}

export const DataTablePaginationV2 = memo(Inner) as typeof Inner;
