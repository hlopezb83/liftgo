import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import SupplierDetailPage from "../SupplierDetailPage";

/**
 * Ronda 4 (FE4-02): si el listado de proveedores falla, la página de detalle
 * debe mostrar QueryErrorState, no el mensaje de "no encontrado" (el
 * proveedor podría existir perfectamente, solo falló el fetch).
 */

const useSuppliersMock = vi.fn();
const useSupplierBillsMock = vi.fn();
const useMaintenanceLogsMock = vi.fn();
const useForkliftMapMock = vi.fn();

vi.mock("../../hooks/useSuppliers", () => ({
  useSuppliers: () => useSuppliersMock(),
  SUPPLIER_CATEGORIES: {},
}));

vi.mock("@/features/accounts-payable", () => ({
  useSupplierBills: () => useSupplierBillsMock(),
}));

vi.mock("@/features/maintenance", () => ({
  useMaintenanceLogs: () => useMaintenanceLogsMock(),
}));

vi.mock("@/features/fleet", () => ({
  useForkliftMap: () => useForkliftMapMock(),
  DocumentAttachments: () => null,
}));

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestRouter initialEntries={["/suppliers/sp-1"]} path="/suppliers/$id">
        <SupplierDetailPage />
      </TestRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSuppliersMock.mockReset();
  useSupplierBillsMock.mockReset();
  useMaintenanceLogsMock.mockReset();
  useForkliftMapMock.mockReset();
  useSupplierBillsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  useMaintenanceLogsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  useForkliftMapMock.mockReturnValue({ forkliftMap: new Map(), forklifts: undefined, isLoading: false, isError: false, refetch: vi.fn() });
});

describe("SupplierDetailPage (FE4-02)", () => {
  it("muestra QueryErrorState cuando los proveedores fallan, no el mensaje de 'no encontrado'", async () => {
    useSuppliersMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });

    renderPage();

    expect(await screen.findByText("No se pudo cargar los proveedores")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText("Proveedor no encontrado")).not.toBeInTheDocument();
  });
});
