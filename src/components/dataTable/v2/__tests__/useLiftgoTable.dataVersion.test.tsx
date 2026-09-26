// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ColumnDef } from "../types";
import { describe, expect, it } from "vitest";
import { useLiftgoTable } from "@/components/dataTable/v2/useLiftgoTable";

interface Row {
  id: string;
  name: string;
}
const cols: ColumnDef<Row>[] = [{ accessorKey: "name", header: "Nombre" }];
const rowsA: Row[] = [{ id: "1", name: "Ada" }, { id: "2", name: "Bob" }];
const rowsB: Row[] = [{ id: "3", name: "Cal" }, { id: "4", name: "Dan" }]; // misma longitud, distinto contenido

describe("useLiftgoTable — actualización de filas", () => {
  it("misma longitud + distinto contenido → filas nuevas", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useLiftgoTable<Row>({ data, columns: cols, getRowId: (r) => r.id }),
      { initialProps: { data: rowsA } },
    );
    rerender({ data: rowsB });
    expect(result.current.getRowModel().rows.map((row) => row.original.name)).toEqual(["Cal", "Dan"]);
  });

  it("la misma data mantiene las filas y su orden", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useLiftgoTable<Row>({ data, columns: cols, getRowId: (r) => r.id }),
      { initialProps: { data: rowsA } },
    );
    rerender({ data: rowsA });
    expect(result.current.getRowModel().rows.map((row) => row.original.name)).toEqual(["Ada", "Bob"]);
  });

  it("mismo id + campo editado → celda actualizada", () => {
    const original: Row[] = [{ id: "1", name: "Ada" }, { id: "2", name: "Bob" }];
    const edited: Row[] = [{ id: "1", name: "Ada Lovelace" }, { id: "2", name: "Bob" }];
    const { result, rerender } = renderHook(
      ({ data }) => useLiftgoTable<Row>({ data, columns: cols, getRowId: (r) => r.id }),
      { initialProps: { data: original } },
    );
    rerender({ data: edited });
    expect(result.current.getRowModel().rows[0]?.getValue("name")).toBe("Ada Lovelace");
  });
});

