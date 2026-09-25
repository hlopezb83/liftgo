import { render, screen, fireEvent } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "@/hooks/use-mobile";
import { ListPageLayout } from "../ListPageLayout";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
  useIsTabletOrBelow: vi.fn(() => false),
}));

beforeEach(() => { vi.mocked(useIsMobile).mockReturnValue(false); });

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
      <TestRouter>
        <ListPageLayout
          title="Facturas"
          isLoading={false}
          table={makeTableStub([])}
          {...props}
        />
      </TestRouter>
    </QueryClientProvider>,
  );
}

describe("ListPageLayout — UX-M6 EmptyState honesto", () => {
  it("sin filtros activos muestra copy default de sin registros", async () => {
    renderLayout({ emptyMessage: "No se encontraron resultados" });
    expect(await screen.findByText("No se encontraron resultados")).toBeInTheDocument();
    expect(
      screen.getByText(/Aún no hay registros aquí/i),
    ).toBeInTheDocument();
    // No se ofrece "Limpiar filtros" cuando no hay filtros activos.
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).toBeNull();
  });

  it("con filtros activos muestra copy alterno y botón limpiar", async () => {
    const onClear = vi.fn();
    renderLayout({ hasActiveFilters: true, onClearFilters: onClear });
    expect(
      await screen.findByText("No hay resultados con los filtros actuales"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ajusta o limpia los filtros/i),
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /limpiar filtros/i });
    fireEvent.click(btn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("con filtros activos pero sin callback, no renderiza botón (evita dead-end mudo)", async () => {
    renderLayout({ hasActiveFilters: true });
    expect(
      await screen.findByText("No hay resultados con los filtros actuales"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).toBeNull();
  });
});

describe("ListPageLayout — acciones móviles", () => {
  it("mantiene acciones secundarias y filtros junto al botón principal móvil", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    renderLayout({
      actions: <button>Alta de escritorio</button>,
      mobileActions: <button>Exportar CSV</button>,
      mobileFab: <button aria-label="Nuevo cliente">+</button>,
      filters: <input aria-label="Buscar clientes" />,
    });

    expect(await screen.findByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo cliente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alta de escritorio" })).toBeNull();
  });
});
