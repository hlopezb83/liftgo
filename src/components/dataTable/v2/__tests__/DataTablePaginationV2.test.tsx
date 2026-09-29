import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTablePaginationV2 } from "../DataTablePaginationV2";
import { useLiftgoTable } from "../useLiftgoTable";

function Pagination({ count, hasMoreRows }: { count: number; hasMoreRows: boolean }) {
  const table = useLiftgoTable({
    data: Array.from({ length: count }, (_, i) => ({ id: String(i) })),
    columns: [{ accessorKey: "id" }],
    getRowId: (row) => row.id,
  });
  return <DataTablePaginationV2 table={table} hasMoreRows={hasMoreRows} />;
}

function ServerPagination() {
  const table = useLiftgoTable({
    data: Array.from({ length: 25 }, (_, i) => ({ id: String(i) })),
    columns: [{ accessorKey: "id" }],
    getRowId: (row) => row.id,
    controlledPagination: { pageIndex: 2, pageSize: 25 },
    pageCount: 4,
    manualSorting: true,
  });
  return <DataTablePaginationV2 table={table} rowCount={76} />;
}

describe("DataTablePaginationV2 — conteos parciales", () => {
  it("distingue las filas cargadas del total cuando aún hay más páginas", () => {
    const { rerender } = render(<Pagination count={100} hasMoreRows />);
    expect(screen.getByText("1–25 de al menos 100")).toBeInTheDocument();
    rerender(<Pagination count={120} hasMoreRows={false} />);
    expect(screen.getByText("1–25 de 120")).toBeInTheDocument();
    expect(screen.queryByText(/al menos/)).toBeNull();
  });

  it("muestra el conteo remoto cuando la tabla sólo contiene una página", () => {
    render(<ServerPagination />);

    expect(screen.getByText("51–75 de 76")).toBeInTheDocument();
    expect(screen.getByText("3 de 4")).toBeInTheDocument();
  });
});
