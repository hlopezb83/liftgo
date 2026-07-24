// @vitest-environment jsdom
// TESTS-ARQ2 (v7.220.0 DIFF 8): R12-A1 — con `dataVersion = length`, filtrar
// a mismo número de filas servía JSX viejo (stale). El fix usa hash por
// contenido; este test protege esa invariante.
import { renderHook } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";
import { useLiftgoTable } from "@/components/dataTable/v2/useLiftgoTable";

interface Row {
  id: string;
  name: string;
}
const cols: ColumnDef<Row>[] = [{ accessorKey: "name", header: "Nombre" }];
const rowsA: Row[] = [{ id: "1", name: "Ada" }, { id: "2", name: "Bob" }];
const rowsB: Row[] = [{ id: "3", name: "Cal" }, { id: "4", name: "Dan" }]; // misma longitud, distinto contenido

describe("useLiftgoTable — versión por identidad de contenido", () => {
  it("R12-A1: misma longitud + distinto contenido → nueva identidad (no stale)", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useLiftgoTable<Row>({ data, columns: cols, getRowId: (r) => r.id }),
      { initialProps: { data: rowsA } },
    );
    const first = result.current;
    rerender({ data: rowsB });
    expect(result.current).not.toBe(first);
  });

  it("misma data → misma identidad de Proxy (no re-render innecesario)", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useLiftgoTable<Row>({ data, columns: cols, getRowId: (r) => r.id }),
      { initialProps: { data: rowsA } },
    );
    const first = result.current;
    rerender({ data: rowsA });
    expect(result.current).toBe(first);
  });
});
