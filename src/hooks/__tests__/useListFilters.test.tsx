import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { useListFilters } from "@/hooks/useListFilters";

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  customers?: { name: string } | null;
}

const data: Row[] = [
  { id: "1", name: "Acme Corp", status: "active", customers: { name: "Juan Pérez" } },
  { id: "2", name: "Globex", status: "inactive", customers: { name: "María López" } },
  { id: "3", name: "Initech", status: "active", customers: null },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/list"]}>{children}</MemoryRouter>
);

describe("useListFilters", () => {
  beforeEach(() => sessionStorage.clear());

  it("sin filtros devuelve todo", () => {
    const { result } = renderHook(
      () => useListFilters<Row>(data, { searchFields: ["name"], statusField: "status" }),
      { wrapper },
    );
    expect(result.current.filtered).toHaveLength(3);
    expect(result.current.search).toBe("");
    expect(result.current.statusFilter).toBe("all");
  });

  it("filtra por search en searchFields (case-insensitive)", () => {
    const { result } = renderHook(
      () => useListFilters<Row>(data, { searchFields: ["name"] }),
      { wrapper },
    );
    act(() => result.current.setSearch("acme"));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered?.[0].id).toBe("1");
  });

  it("filtra por accessor (campos joined)", () => {
    const { result } = renderHook(
      () =>
        useListFilters<Row>(data, {
          searchFields: ["name"],
          searchAccessors: [(r) => r.customers?.name],
        }),
      { wrapper },
    );
    act(() => result.current.setSearch("maría"));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered?.[0].id).toBe("2");
  });

  it("filtra por status cuando se provee statusField", () => {
    const { result } = renderHook(
      () => useListFilters<Row>(data, { searchFields: ["name"], statusField: "status" }),
      { wrapper },
    );
    act(() => result.current.setStatusFilter("active"));
    expect(result.current.filtered).toHaveLength(2);
    expect(result.current.filtered?.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("persiste filtros en sessionStorage por pathname", () => {
    const { result } = renderHook(
      () => useListFilters<Row>(data, { searchFields: ["name"] }),
      { wrapper },
    );
    act(() => result.current.setSearch("globex"));
    expect(sessionStorage.getItem("list-filters:/list")).toContain("q=globex");
  });

  it("limpia sessionStorage al vaciar todos los filtros", () => {
    const { result } = renderHook(
      () => useListFilters<Row>(data, { searchFields: ["name"] }),
      { wrapper },
    );
    act(() => result.current.setSearch("x"));
    act(() => result.current.setSearch(""));
    expect(sessionStorage.getItem("list-filters:/list")).toBeNull();
  });
});
