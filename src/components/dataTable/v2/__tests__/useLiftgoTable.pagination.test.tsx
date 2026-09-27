import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLiftgoTable } from "../useLiftgoTable";
import type { ColumnDef } from "../types";

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

    expect(result.current.state.pagination.pageIndex).toBe(0);

    act(() => {
      result.current.setPageIndex(1);
    });
    expect(result.current.state.pagination.pageIndex).toBe(1);

    rerender();
    rerender();
    expect(result.current.state.pagination.pageIndex).toBe(1);
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
    expect(result.current.state.pagination.pageIndex).toBe(2);

    rerender({ key: "b" });
    expect(result.current.state.pagination.pageIndex).toBe(0);
  });

  it("regresa a la página 1 cuando cambian filas, aunque el total sea igual", () => {
    const original = makeRows(60);
    const updated = original.map((row) => ({ ...row }));
    updated[0].name = "Nuevo registro";
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useLiftgoTable({
        data,
        columns,
        getRowId,
        initialPageSize: 25,
      }),
      { initialProps: { data: original } },
    );

    act(() => result.current.setPageIndex(1));
    expect(result.current.state.pagination.pageIndex).toBe(1);
    rerender({ data: updated });
    expect(result.current.state.pagination.pageIndex).toBe(0);
    expect(result.current.getRowModel().rows[0]?.original.name).toBe("Nuevo registro");
  });
});

describe("useLiftgoTable · páginas anexadas", () => {
  it("conserva la página 4 al cargar de 100 a 120 filas y permite avanzar", () => {
    const { result, rerender } = renderHook(
      ({ data, key }: { data: Row[]; key: string }) => useLiftgoTable({
        data, columns, getRowId, resetKey: key, preservePaginationOnAppend: true,
      }),
      { initialProps: { data: makeRows(100), key: "all" } },
    );
    act(() => result.current.setPageIndex(3));
    rerender({ data: makeRows(120), key: "all" });
    expect(result.current.state.pagination.pageIndex).toBe(3);
    expect(result.current.getRowModel().rows[0]?.original.name).toBe("Row 75");
    act(() => result.current.nextPage());
    expect(result.current.state.pagination.pageIndex).toBe(4);
    expect(result.current.getRowModel().rows[0]?.original.name).toBe("Row 100");
  });

  it("reinicia al cambiar filtros aunque las filas se hayan anexado", () => {
    const { result, rerender } = renderHook(
      ({ data, key }: { data: Row[]; key: string }) => useLiftgoTable({
        data, columns, getRowId, resetKey: key, preservePaginationOnAppend: true,
      }),
      { initialProps: { data: makeRows(100), key: "all" } },
    );
    act(() => result.current.setPageIndex(3));
    rerender({ data: makeRows(120), key: "paid" });
    expect(result.current.state.pagination.pageIndex).toBe(0);
  });

  it("reinicia si una fila previa se editó; no lo trata como anexado", () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: Row[] }) => useLiftgoTable({
        data, columns, getRowId, preservePaginationOnAppend: true,
      }),
      { initialProps: { data: makeRows(100) } },
    );
    act(() => result.current.setPageIndex(3));
    const updated = makeRows(120);
    updated[0].name = "Edited";
    rerender({ data: updated });
    expect(result.current.state.pagination.pageIndex).toBe(0);
  });
});

describe("useLiftgoTable · funciones v9", () => {
  it("ordena números en ambos sentidos y deja null y undefined al final", () => {
    const values: Array<{ id: string; amount: number | null | undefined }> = [
      { id: "null", amount: null },
      { id: "undefined", amount: undefined },
      { id: "one", amount: 1 },
      { id: "two", amount: 2 },
    ];
    const amountColumns: ColumnDef<(typeof values)[number]>[] = [
      { accessorKey: "amount", header: "Monto" },
    ];
    const { result } = renderHook(() => useLiftgoTable({
      data: values,
      columns: amountColumns,
      getRowId: (row) => row.id,
    }));

    act(() => result.current.setSorting([{ id: "amount", desc: false }]));
    expect(result.current.getRowModel().rows.map((row) => row.id)).toEqual(["one", "two", "null", "undefined"]);

    act(() => result.current.setSorting([{ id: "amount", desc: true }]));
    expect(result.current.getRowModel().rows.map((row) => row.id)).toEqual(["two", "one", "null", "undefined"]);
  });

  it("filtra globalmente y mantiene la selección por ID", () => {
    const values = [{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }];
    const { result, rerender } = renderHook(
      ({ filter }: { filter: string }) => useLiftgoTable({
        data: values,
        columns,
        getRowId,
        globalFilter: filter,
        enableRowSelection: true,
      }),
      { initialProps: { filter: "" } },
    );

    act(() => result.current.getRow("a").toggleSelected(true));
    expect(result.current.state.rowSelection).toEqual({ a: true });

    rerender({ filter: "Beto" });
    expect(result.current.getRowModel().rows.map((row) => row.id)).toEqual(["b"]);
    expect(result.current.state.rowSelection).toEqual({ a: true });
  });
});
