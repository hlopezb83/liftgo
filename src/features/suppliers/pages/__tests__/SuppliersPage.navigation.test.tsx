import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupplierListBackTo } from "@/lib/navigation/customerInvoiceOrigins";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";
import SupplierDetailPage from "../SupplierDetailPage";
import SuppliersPage from "../SuppliersPage";
import type { Supplier } from "../../hooks/useSuppliers";

const fixture = vi.hoisted(() => ({
  suppliers: [] as Supplier[],
  pages: [] as Supplier[][],
  hasNextPage: false,
  mobile: false,
  exportCsv: vi.fn(),
  fetchNextPage: vi.fn(),
}));

// Keep the real router, filters, table, cards and return button; replace only
// backend data, file downloads and unrelated detail/editor sections.
vi.mock("../../hooks/useSuppliers", () => ({
  useSuppliersIncremental: () => ({ data: { pages: fixture.pages }, isLoading: false, isError: false,
    refetch: vi.fn(), hasNextPage: fixture.hasNextPage, isFetchingNextPage: false, fetchNextPage: fixture.fetchNextPage }),
  useSupplier: (id: string) => ({ data: fixture.suppliers.find(supplier => supplier.id === id),
    isLoading: false, isError: false, refetch: vi.fn() }),
  SUPPLIER_CATEGORIES: { mantenimiento: "Mantenimiento" },
}));
vi.mock("@/lib/exportCsv", () => ({ exportToCsv: fixture.exportCsv }));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => fixture.mobile,
  useIsTabletOrBelow: () => fixture.mobile,
}));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("../../hooks/useSupplierLinkedActivity", () => ({
  useSupplierLinkedBills: () => ({ data: [], isLoading: false, isError: false }),
  useSupplierLinkedMaintenance: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/features/fleet", () => ({ DocumentAttachments: () => null }));
vi.mock("../../components/suppliers/SupplierContactsSection", () => ({ SupplierContactsSection: () => null }));
vi.mock("../../components/suppliers/SupplierBankAccountsSection", () => ({ SupplierBankAccountsSection: () => null }));
vi.mock("../../components/suppliers/SupplierFormDialog", () => ({ SupplierFormDialog: () => null }));

const supplier = (index: number): Supplier => ({
  id: `supplier-${index}`, name: `Acero ${String(index).padStart(3, "0")}`, category: "mantenimiento",
  rfc: `RFC${index}`, email: null, phone: null, contact_person: null, website: null, address: null,
  regimen_fiscal: null, notes: null, default_payment_terms_days: null, created_at: "2026-11-12", updated_at: "2026-11-12",
});

const listOrigin = `/suppliers?${new URLSearchParams({
  q: "Acero", tablePage: "1", tableSize: "10", tableSort: JSON.stringify([{ id: "name", desc: true }]),
})}#results`;

function renderFlow(entry = listOrigin) {
  const root = createRootRoute({ component: Outlet });
  const list = createRoute({ getParentRoute: () => root, path: "/suppliers", component: SuppliersPage });
  const detail = createRoute({ getParentRoute: () => root, path: "/suppliers/$id", component: SupplierDetailPage });
  const router = createRouter({
    routeTree: root.addChildren([list, detail]),
    history: createMemoryHistory({ initialEntries: [entry] }),
    parseSearch, stringifySearch, defaultPendingMinMs: 0,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  fixture.mobile = false;
  fixture.hasNextPage = false;
  fixture.suppliers = [
    ...Array.from({ length: 30 }, (_, index) => supplier(index + 1)),
    { ...supplier(31), name: "Logística Norte" },
  ];
  fixture.pages = [fixture.suppliers];
});
afterEach(cleanup);

describe("Supplier filtered export and list return", () => {
  it("exports every filtered supplier, including other table pages, and excludes nonmatches", async () => {
    renderFlow();
    await screen.findByRole("link", { name: "Ver proveedor Acero 020" });
    expect(screen.queryByRole("link", { name: "Ver proveedor Acero 030" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(fixture.exportCsv).toHaveBeenCalledOnce();
    const [filename, rows] = fixture.exportCsv.mock.calls[0];
    expect(filename).toBe("proveedores.csv");
    expect(rows).toHaveLength(30);
    expect(rows).toContainEqual(expect.objectContaining({ Nombre: "Acero 030", Categoría: "Mantenimiento" }));
    expect(rows).not.toContainEqual(expect.objectContaining({ Nombre: "Logística Norte" }));
  });

  it("keeps exporting unavailable until all server pages have loaded", async () => {
    fixture.hasNextPage = true;
    renderFlow();
    await screen.findByRole("link", { name: "Ver proveedor Acero 020" });
    expect(screen.queryByRole("button", { name: "Exportar CSV" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(fixture.fetchNextPage).toHaveBeenCalledOnce();
    expect(fixture.exportCsv).not.toHaveBeenCalled();
  });

  it.each(["desktop link", "desktop row", "mobile link"])("returns to the same filtered, sorted page from the %s", async (surface) => {
    fixture.mobile = surface === "mobile link";
    const router = renderFlow();
    const link = await screen.findByRole("link", { name: "Ver proveedor Acero 020" });
    const origin = router.state.location.href;
    if (surface === "desktop row") fireEvent.click(link.closest("tr")!);
    else fireEvent.click(link);
    await screen.findByRole("heading", { name: "Acero 020" });
    expect(router.state.location.state).toMatchObject({ supplierListBackTo: origin });
    window.sessionStorage.setItem("list-filters:/suppliers", "q=unrelated");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(router.state.location.href).toBe(origin));
    expect(await screen.findByRole("link", { name: "Ver proveedor Acero 020" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver proveedor Acero 030" })).not.toBeInTheDocument();
    expect(screen.getByText("11–20 de 30")).toBeInTheDocument();
  });

  it("does not restore unrelated cached filters when the captured list had none", async () => {
    const router = renderFlow("/suppliers");
    fireEvent.click(await screen.findByRole("link", { name: "Ver proveedor Acero 001" }));
    await screen.findByRole("heading", { name: "Acero 001" });
    window.sessionStorage.setItem("list-filters:/suppliers", "q=unrelated");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(router.state.location.href).toBe("/suppliers"));
  });

  it("keeps loaded rows and load-more reachable when a restored page exceeds the current cache", async () => {
    fixture.pages = [fixture.suppliers.slice(0, 12)];
    fixture.hasNextPage = true;
    const router = renderFlow("/suppliers?q=Acero&tablePage=5&tableSize=10");
    expect(await screen.findByRole("link", { name: "Ver proveedor Acero 011" })).toBeInTheDocument();
    expect(screen.getByText("11–12 de al menos 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cargar más" })).toBeEnabled();
    expect(new URLSearchParams(router.state.location.searchStr).get("tablePage")).toBe("5");
  });

  it.each(["https://example.com/suppliers", "//example.com/suppliers", "/suppliers-other", "/suppliers/../customers", "/suppliers?x=\\bad", "/suppliers?x=\n", 42])(
    "rejects an unrelated or malformed captured return destination: %s", (origin) => {
      expect(getSupplierListBackTo({ supplierListBackTo: origin })).toBeUndefined();
    },
  );
});
