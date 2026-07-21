import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ListPageLayout } from "../ListPageLayout";

// Stub del hook TanStack Table para no montar toda la maquinaria.
function makeTableStub<T>(rows: T[]) {
  return {
    getRowModel: () => ({ rows: rows.map((r) => ({ original: r })) }),
    // Métodos consumidos por DataTableV2/DataTablePaginationV2 — no se ejecutan
    // porque la lista está vacía o el error/loading interceptan primero.
    getHeaderGroups: () => [],
    getState: () => ({ pagination: { pageIndex: 0, pageSize: 25 } }),
    getPageCount: () => 0,
    getCanPreviousPage: () => false,
    getCanNextPage: () => false,
  } as unknown as Parameters<typeof ListPageLayout>[0]["table"];
}

function renderLayout(props: Partial<Parameters<typeof ListPageLayout>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ListPageLayout
          title="Facturas"
          isLoading={false}
          table={makeTableStub([])}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ListPageLayout — UX-M6 EmptyState honesto", () => {
  it("sin filtros activos muestra copy default de sin registros", () => {
    renderLayout({ emptyMessage: "No se encontraron resultados" });
    expect(screen.getByText("No se encontraron resultados")).toBeInTheDocument();
    expect(
      screen.getByText(/Aún no hay registros aquí/i),
    ).toBeInTheDocument();
    // No se ofrece "Limpiar filtros" cuando no hay filtros activos.
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).toBeNull();
  });

  it("con filtros activos muestra copy alterno y botón limpiar", () => {
    const onClear = vi.fn();
    renderLayout({ hasActiveFilters: true, onClearFilters: onClear });
    expect(
      screen.getByText("No hay resultados con los filtros actuales"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ajusta o limpia los filtros/i),
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /limpiar filtros/i });
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("con filtros activos pero sin callback, no renderiza botón (evita dead-end mudo)", () => {
    renderLayout({ hasActiveFilters: true });
    expect(
      screen.getByText("No hay resultados con los filtros actuales"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).toBeNull();
  });
});
