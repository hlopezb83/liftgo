import { act, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTableHeaderV2 } from "../DataTableHeaderV2";
import { useLiftgoTable } from "../useLiftgoTable";
import type { ColumnDef } from "../types";

interface Item { id: string; name: string }

const data: Item[] = [{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }];
const columns: ColumnDef<Item>[] = [{ accessorKey: "name", header: "Nombre" }];

describe("DataTableHeaderV2", () => {
  it("actualiza aria-sort al cambiar la dirección del orden", () => {
    const { result } = renderHook(() => useLiftgoTable({
      data,
      columns,
      getRowId: (row) => row.id,
    }));
    const view = render(<table><DataTableHeaderV2 table={result.current} showSelection={false} /></table>);

    expect(screen.getByRole("columnheader", { name: "Nombre" })).toHaveAttribute("aria-sort", "none");
    act(() => result.current.setSorting([{ id: "name", desc: false }]));
    view.rerender(<table><DataTableHeaderV2 table={result.current} showSelection={false} /></table>);
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toHaveAttribute("aria-sort", "ascending");

    act(() => result.current.setSorting([{ id: "name", desc: true }]));
    view.rerender(<table><DataTableHeaderV2 table={result.current} showSelection={false} /></table>);
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toHaveAttribute("aria-sort", "descending");
  });
});
