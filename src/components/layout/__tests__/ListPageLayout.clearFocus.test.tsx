import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { ListPageLayout } from "../ListPageLayout";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => viewport.mobile, useIsTabletOrBelow: () => viewport.mobile }));

function FilteredList({ mode }: { mode: "search" | "filters" | "responsive" | "fallback" | "view" }) {
  const [active, setActive] = useState(true);
  return <>
    <input type="search" aria-label="Búsqueda de otra lista" />
    <ListPageLayout title="Facturas" isLoading={false}
      search={mode === "search" || mode === "view" ? <input key={active ? "before" : "after"} type="search" aria-label="Buscar facturas" defaultValue={active ? "QA" : ""} /> : undefined}
      filters={mode === "filters" || mode === "responsive" ? <select aria-label="Estado de facturas"><option>Todos</option></select> : undefined}
      hasActiveFilters={active} activeFilterLabels={active ? ["Cobro: Parcial"] : mode === "view" ? ["Vista: Atrasados"] : []}
      onClearFilters={mode === "view" && !active ? undefined : () => { if (mode === "responsive") viewport.mobile = false; setActive(false); }}
    />
  </>;
}

beforeEach(() => { viewport.mobile = false; });

describe("ListPageLayout clear-filter focus", () => {
  it("restores focus when a persistent view label remains but the clear action disappears", async () => {
    render(<TestRouter><FilteredList mode="view" /></TestRouter>);
    const clear = await screen.findByRole("button", { name: "Limpiar filtros activos" });
    clear.focus();
    fireEvent.click(clear);
    expect(await screen.findByText("Vista: Atrasados")).toBeInTheDocument();
    expect(clear).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar facturas" })).toHaveFocus();
  });
  it.each(["search", "filters", "responsive", "fallback"] as const)("resolves the current %s destination in this list after removing the chips", async (mode) => {
    viewport.mobile = mode === "filters" || mode === "responsive";
    render(<TestRouter><FilteredList mode={mode} /></TestRouter>);
    const clear = await screen.findByRole("button", { name: "Limpiar filtros activos" });
    const formerSearch = screen.queryByRole("searchbox", { name: "Buscar facturas" });
    clear.focus();
    expect(clear).toHaveFocus();
    fireEvent.click(clear);
    await waitFor(() => expect(screen.queryByRole("list", { name: "Filtros activos" })).not.toBeInTheDocument());
    const target = mode === "search" ? screen.getByRole("searchbox", { name: "Buscar facturas" })
      : mode === "filters" ? screen.getByRole("button", { name: "Filtros" })
        : mode === "responsive" ? screen.getByRole("combobox", { name: "Estado de facturas" })
          : screen.getByRole("region", { name: "Facturas: controles y resultados" });
    expect(target).toHaveFocus();
    expect(clear).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Búsqueda de otra lista" })).not.toHaveFocus();
    if (mode === "search") {
      expect(formerSearch).not.toBeInTheDocument();
      expect(target).not.toBe(formerSearch);
      expect(target).toHaveValue("");
    }
  });
});
