import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, it, expect, beforeEach } from "vitest";
import { useTableFilters } from "@/hooks/filters/useTableFilters";

interface Row extends Record<string, unknown> {
  id: string;
  name: string;
  status: string;
  issued_at: string;
}

const rows: Row[] = [
  { id: "1", name: "Acme Corp", status: "active", issued_at: "2026-01-15" },
  { id: "2", name: "Globex", status: "inactive", issued_at: "2026-02-10" },
  { id: "3", name: "Initech", status: "active", issued_at: "2026-03-05" },
  { id: "4", name: "Umbrella", status: "pending", issued_at: "2026-03-20" },
];

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={["/list"]}>{children}</MemoryRouter>
);

describe("useTableFilters", () => {
  beforeEach(() => sessionStorage.clear());

  it("sin filtros activos devuelve todos los items y hasActive=false", () => {
    const { result } = renderHook(
      () =>
        useTableFilters<Row, {
          q: { type: "text"; fields: (keyof Row)[] };
          status: { type: "enum"; field: keyof Row; options: readonly string[] };
        }>({
          items: rows,
          facets: {
            q: { type: "text", fields: ["name"] },
            status: { type: "enum", field: "status", options: ["all", "active", "inactive", "pending"] },
          },
        }),
      { wrapper },
    );

    expect(result.current.filtered).toHaveLength(4);
    expect(result.current.hasActive).toBe(false);
  });

  it("filtro de texto reduce el dataset usando match-sorter", () => {
    const { result } = renderHook(
      () =>
        useTableFilters<Row, { q: { type: "text"; fields: (keyof Row)[] } }>({
          items: rows,
          facets: { q: { type: "text", fields: ["name"] } },
        }),
      { wrapper },
    );

    act(() => result.current.set("q", "acme"));

    expect(result.current.filtered.map((r) => r.id)).toEqual(["1"]);
    expect(result.current.hasActive).toBe(true);
  });

  it("filtro de enum aplica igualdad y respeta 'all'", () => {
    const { result } = renderHook(
      () =>
        useTableFilters<Row, {
          status: { type: "enum"; field: keyof Row; options: readonly string[] };
        }>({
          items: rows,
          facets: {
            status: { type: "enum", field: "status", options: ["all", "active", "inactive", "pending"] },
          },
        }),
      { wrapper },
    );

    act(() => result.current.set("status", "active"));
    expect(result.current.filtered.map((r) => r.id).sort()).toEqual(["1", "3"]);
    expect(result.current.hasActive).toBe(true);

    act(() => result.current.set("status", "all"));
    expect(result.current.filtered).toHaveLength(4);
    expect(result.current.hasActive).toBe(false);
  });

  it("reset limpia todos los facets", () => {
    const { result } = renderHook(
      () =>
        useTableFilters<Row, {
          q: { type: "text"; fields: (keyof Row)[] };
          status: { type: "enum"; field: keyof Row; options: readonly string[] };
        }>({
          items: rows,
          facets: {
            q: { type: "text", fields: ["name"] },
            status: { type: "enum", field: "status", options: ["all", "active", "inactive"] },
          },
        }),
      { wrapper },
    );

    act(() => {
      result.current.set("q", "acme");
      result.current.set("status", "active");
    });
    expect(result.current.hasActive).toBe(true);

    act(() => result.current.reset());
    expect(result.current.hasActive).toBe(false);
    expect(result.current.filtered).toHaveLength(4);
  });

  it("filterKey cambia cuando cambian los valores primitivos", () => {
    const { result } = renderHook(
      () =>
        useTableFilters<Row, { q: { type: "text"; fields: (keyof Row)[] } }>({
          items: rows,
          facets: { q: { type: "text", fields: ["name"] } },
        }),
      { wrapper },
    );

    const initial = result.current.filterKey;
    act(() => result.current.set("q", "acme"));
    expect(result.current.filterKey).not.toBe(initial);
  });
});
