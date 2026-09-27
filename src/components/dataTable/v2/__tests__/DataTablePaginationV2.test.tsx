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

describe("DataTablePaginationV2 — conteos parciales", () => {
  it("distingue las filas cargadas del total cuando aún hay más páginas", () => {
    const { rerender } = render(<Pagination count={100} hasMoreRows />);
    expect(screen.getByText("1–25 de al menos 100")).toBeInTheDocument();
    rerender(<Pagination count={120} hasMoreRows={false} />);
    expect(screen.getByText("1–25 de 120")).toBeInTheDocument();
    expect(screen.queryByText(/al menos/)).toBeNull();
  });
});
