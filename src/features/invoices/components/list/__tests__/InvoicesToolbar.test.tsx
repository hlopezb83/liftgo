import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FiltersToolbar } from "@/components/filters/FiltersToolbar";
import { ListPageControls } from "@/components/layout/listPage/ListPageControls";
import { InvoicesFiltersBar } from "../InvoicesToolbar";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true, useIsTabletOrBelow: () => true }));

function Harness({ onSearch }: { onSearch: (value: string) => void }) {
  const [mobile, setMobile] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("paid");
  const [cfdi, setCfdi] = useState("stamped");
  const [range, setRange] = useState<Parameters<typeof InvoicesFiltersBar>[0]["dateRange"]>({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 17) });
  return <>
    <button onClick={() => setMobile((v) => !v)}>Cambiar tamaño</button>
    <ListPageControls isMobile={mobile} stacked hasActiveFilters filtersOpen={open} onFiltersOpenChange={setOpen}
      search={<FiltersToolbar.Search value={search} onChange={(value) => { setSearch(value); onSearch(value); }} placeholder="Buscar facturas…" />}
      filters={<InvoicesFiltersBar statusFilter={status} setStatusFilter={setStatus} cfdiFilter={cfdi} setCfdiFilter={setCfdi} dateRange={range} setDateRange={setRange} hasActive onClear={vi.fn()} />}
    />
  </>;
}

function expectFacets() {
  expect(screen.getByRole("combobox", { name: "Filtrar por estado" })).toHaveTextContent("Pagado");
  expect(screen.getByRole("combobox", { name: "Filtrar por estado CFDI" })).toHaveTextContent("Timbrado");
  expect(screen.getByRole("textbox", { name: "Fecha de emisión — inicio" })).toHaveValue("01/10/2026");
  expect(screen.getByRole("textbox", { name: "Fecha de emisión — fin" })).toHaveValue("17/10/2026");
}

describe("V03 · búsqueda separada de facetas", () => {
  it("busca sin abrir filtros y conserva valores al cerrar, reabrir y cambiar tamaño", async () => {
    const onSearch = vi.fn();
    render(<Harness onSearch={onSearch} />);
    const search = screen.getByRole("searchbox", { name: "Buscar facturas…" });
    expect(search).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Filtrar por estado" })).toBeNull();
    fireEvent.change(search, { target: { value: "FAC-0475" } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("FAC-0475"));
    expect(onSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Filtros activos" }));
    expectFacets();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getByRole("dialog").querySelector('input[type="search"]')).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Filtros activos" }));
    expectFacets();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Cambiar tamaño" }));
    expectFacets();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getByRole("searchbox")).toHaveValue("FAC-0475");
    fireEvent.click(screen.getByRole("button", { name: "Cambiar tamaño" }));
    fireEvent.click(screen.getByRole("button", { name: "Filtros activos" }));
    expectFacets();
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});