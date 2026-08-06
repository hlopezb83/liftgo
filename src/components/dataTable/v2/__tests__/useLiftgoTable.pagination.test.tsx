import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLiftgoTable } from "../useLiftgoTable";
import type { ColumnDef } from "@tanstack/react-table";

interface Row {
  id: string;
  name: string;
}

const columns: ColumnDef<Row>[] = [{ id: "name", accessorKey: "name" }];
const getRowId = (r: Row): string => r.id;

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: String(i), name: `Row ${i}` }));
}

describe("useLiftgoTable · paginación", () => {
  it("avanza de página y la conserva aunque el arreglo cambie de referencia", () => {
    const rows = makeRows(60);
    const { result, rerender } = renderHook(
      () =>
        useLiftgoTable<Row>({
          // Nueva referencia en cada render, mismo contenido: así derivan los datos
          // las páginas reales (map/filtros).
          data: rows.map((r) => ({ ...r })),
          columns,
          getRowId,
          initialPageSize: 25,
        }),
      { initialProps: {} },
    );

    expect(result.current.getState().pagination.pageIndex).toBe(0);

    act(() => {
      result.current.setPageIndex(1);
    });
    expect(result.current.getState().pagination.pageIndex).toBe(1);

    rerender();
    rerender();
    expect(result.current.getState().pagination.pageIndex).toBe(1);
    expect(result.current.getRowModel().rows[0]?.original.name).toBe("Row 25");
  });

  it("regresa a la página 1 cuando cambia el resetKey (filtros)", () => {
    const rows = makeRows(60);
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useLiftgoTable<Row>({
          data: rows,
          columns,
          getRowId,
          initialPageSize: 25,
          resetKey: key,
        }),
      { initialProps: { key: "a" } },
    );

    act(() => {
      result.current.setPageIndex(2);
    });
    expect(result.current.getState().pagination.pageIndex).toBe(2);

    rerender({ key: "b" });
    expect(result.current.getState().pagination.pageIndex).toBe(0);
  });
});
