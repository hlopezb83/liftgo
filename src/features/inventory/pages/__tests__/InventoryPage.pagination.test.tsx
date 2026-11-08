import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import type { InventoryPageFilters } from "../../hooks/useInventoryPage";
import InventoryPage from "../InventoryPage";
const state = vi.hoisted(() => ({ mobile: false, error: false, loading: false, retry: vi.fn() }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile, useIsTabletOrBelow: () => state.mobile }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("../../hooks/useInventoryPart", () => ({ useInventoryPart: () => ({ data: null }) }));
vi.mock("../../components/inventory/PartDetailSheet", () => ({ PartDetailSheet: () => null }));
vi.mock("../../components/inventory/PartFormDialog", () => ({ PartFormDialog: () => null }));
vi.mock("../../components/inventory/ActivatePartDialog", () => ({ ActivatePartDialog: () => null }));
vi.mock("../../hooks/useInventoryPage", () => ({ useInventoryPage: (f: InventoryPageFilters) => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: `p${i}`, name: i === 500 ? "Z antigua" : `Pieza ${i}`, sku: i === 500 ? "TARGET" : `SKU${i}`, category: i === 500 ? "Baterías" : "Filtros", stock_quantity: i === 500 ? 0 : 10, min_stock_level: 2, unit_cost: 5 })).filter((p) => (!f.search || `${p.name} ${p.sku}`.includes(f.search)) && (f.category === "all" || p.category === f.category));
  const pageIndex = Math.min(f.pageIndex, Math.max(0, Math.ceil(rows.length / f.pageSize) - 1));
  return { data: state.error || state.loading ? undefined : { items: rows.slice(pageIndex * f.pageSize, (pageIndex + 1) * f.pageSize), totalCount: rows.length, pageIndex, lowStockCount: 1 }, isError: state.error, isLoading: state.loading, refetch: state.retry };
} }));
const mount = (path = "/inventory") => render(<QueryClientProvider client={new QueryClient()}><TestRouter initialEntries={[path]}><InventoryPage /></TestRouter></QueryClientProvider>);
beforeEach(() => { state.error = false; state.loading = false; state.retry.mockReset(); });
afterEach(cleanup);
describe.each([false, true])("inventory server UI mobile=%s", (mobile) => {
  beforeEach(() => { state.mobile = mobile; });
  it("reaches piece501 and displays global indicator on every page", async () => {
    mount(); expect(await screen.findByText("1–25 de 501")).toBeInTheDocument();
    expect(screen.getByText("Refacciones con stock bajo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "21" }));
    expect(await screen.findByText("501–501 de 501")).toBeInTheDocument();
    expect(screen.getByText("TARGET")).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando los primeros/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Habilitar refacción" })).toBeNull();
  });
  it("filters old SKU from later page and preserves global indicator for empty results", async () => {
    mount("/inventory?tablePage=15"); await screen.findByRole("searchbox");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "TARGET" } });
    expect(await screen.findByText("1–1 de 1")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
    expect(await screen.findByText("No hay resultados con los filtros actuales")).toBeInTheDocument();
    expect(screen.getByText("Refacciones con stock bajo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => expect(screen.getByRole("searchbox")).toHaveValue(""));
    expect(await screen.findByText("1–25 de 501")).toBeInTheDocument();
  });
  it("does not present failed query as empty inventory or a verified KPI", async () => {
    state.error = true; mount(); expect(await screen.findByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.queryByText("Sin refacciones registradas")).toBeNull(); expect(screen.queryByText("Refacciones con stock bajo")).toBeNull();
  });
});
