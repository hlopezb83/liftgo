import { render, screen, fireEvent } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIsMobile, useIsTabletOrBelow } from "@/hooks/use-mobile";
import { ListPageLayout } from "../ListPageLayout";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: vi.fn(() => false),
  useIsTabletOrBelow: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(useIsMobile).mockReturnValue(false);
  vi.mocked(useIsTabletOrBelow).mockReturnValue(false);
});

// Stub del hook TanStack Table para no montar toda la maquinaria.
function makeTableStub<T>(rows: T[]) {
  return {
    getRowModel: () => ({ rows: rows.map((r) => ({ original: r })) }),
    getFilteredRowModel: () => ({ rows: rows.map((r) => ({ original: r })) }),
    // Métodos consumidos por DataTableV2/DataTablePaginationV2 — no se ejecutan
    // porque la lista está vacía o el error/loading interceptan primero.
    getHeaderGroups: () => [],
    state: { pagination: { pageIndex: 0, pageSize: 25 } },
    getPageCount: () => Math.ceil(rows.length / 25),
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
      mobilePrimaryAction: <button>Nuevo cliente</button>,
      filters: <input aria-label="Buscar clientes" />,
    });

    expect(await screen.findByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nuevo cliente" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alta de escritorio" })).toBeNull();
    const primary = screen.getByRole("button", { name: "Nuevo cliente" });
    expect(primary.compareDocumentPosition(screen.getByRole("button", { name: "Exportar CSV" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(primary.compareDocumentPosition(screen.getByText("Sin resultados")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reutiliza la acción del encabezado antes de la lista si no hay sustitución móvil", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    renderLayout({ actions: <button>Nueva cotización</button>, filters: <input aria-label="Buscar" /> });
    const primary = await screen.findByRole("button", { name: "Nueva cotización" });
    expect(screen.getAllByRole("button", { name: "Nueva cotización" })).toHaveLength(1);
    expect(primary.compareDocumentPosition(screen.getByText("Sin resultados")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("permite buscar sin abrir el panel móvil de filtros", async () => {
    vi.mocked(useIsMobile).mockReturnValue(true);
    renderLayout({
      search: <input aria-label="Buscar reservas" />,
      filters: <input aria-label="Estado de reserva" />,
    });
    expect(await screen.findByRole("textbox", { name: "Buscar reservas" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Estado de reserva" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByRole("textbox", { name: "Estado de reserva" })).toBeVisible();
  });
});

describe("ListPageLayout — tablero y paginación remota", () => {
  it("muestra el estado vacío con opción de limpiar aunque haya contenido personalizado", async () => {
    const onClear = vi.fn();
    renderLayout({ customContent: <div>Tablero</div>, hasActiveFilters: true, onClearFilters: onClear });
    fireEvent.click(await screen.findByRole("button", { name: "Limpiar filtros" }));
    expect(screen.queryByText("Tablero")).toBeNull();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("muestra error y reintento antes del tablero", async () => {
    const onRetry = vi.fn();
    renderLayout({ customContent: <div>Tablero</div>, isError: true, onRetry });
    fireEvent.click(await screen.findByRole("button", { name: /reintentar/i }));
    expect(screen.queryByText("Tablero")).toBeNull();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("espera la carga antes de mostrar el tablero", async () => {
    const { container } = renderLayout({ customContent: <div>Tablero</div>, isLoading: true });
    await screen.findByRole("heading", { name: "Facturas" });
    expect(screen.queryByText("Tablero")).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("muestra el tablero cuando hay filas", async () => {
    renderLayout({ customContent: <div>Tablero</div>, table: makeTableStub([{ id: "1" }]) });
    expect(await screen.findByText("Tablero")).toBeInTheDocument();
  });

  it("mantiene cargar más cuando no hay coincidencias en las filas cargadas", async () => {
    const onClick = vi.fn();
    renderLayout({ hasActiveFilters: true, loadMore: { hasMore: true, isLoading: false, onClick, loaded: 100 } });
    fireEvent.click(await screen.findByRole("button", { name: "Cargar más" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("presenta una sola navegación y omite el pie redundante al terminar", async () => {
    vi.mocked(useIsTabletOrBelow).mockReturnValue(true);
    renderLayout({
      table: makeTableStub([{ id: "1" }]),
      mobileCardRender: () => <div>Cliente</div>,
      loadMore: { hasMore: false, isLoading: false, onClick: vi.fn(), loaded: 1 },
    });
    expect(await screen.findByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando|No hay más resultados/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });
});

it("indica filtros activos en el botón móvil fuera del panel", async () => {
  vi.mocked(useIsMobile).mockReturnValue(true);
  renderLayout({ filters: <input aria-label="Buscar" />, hasActiveFilters: true });
  expect(await screen.findByRole("button", { name: "Filtros activos" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Filtros" })).toBeNull();
});
