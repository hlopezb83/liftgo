import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import SuppliersPage from "../SuppliersPage";
import type { Supplier } from "../../hooks/useSuppliers";

const supplier = vi.hoisted(() => ({ id: "supplier-8", name: "Servicios de Capacitación Sierra del Acero", category: "otro" }));
vi.mock("../../hooks/useSuppliers", () => ({
  useSuppliers: () => ({ data: [supplier], isLoading: false, isError: false, refetch: vi.fn() }),
  SUPPLIER_CATEGORIES: { otro: "Otro" },
}));
vi.mock("@/components/dataTable/v2", () => ({ useLiftgoTable: () => ({}) }));
vi.mock("@/components/layout/ListPageLayout", () => ({
  ListPageLayout: ({ mobileCardRender }: { mobileCardRender: (supplier: Supplier) => React.ReactNode }) => mobileCardRender(supplier as Supplier),
}));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/hooks/filters/useTableFilters", () => ({
  useTableFilters: () => ({ values: { q: "Capacitación" }, set: vi.fn(), reset: vi.fn(), hasActive: true, filtered: [supplier] }),
}));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("../../components/suppliers/SupplierFormDialog", () => ({ SupplierFormDialog: () => null }));

afterEach(cleanup);

describe("SuppliersPage — tarjeta móvil accesible", () => {
  it("usa un enlace nativo con destino y nombre accesible para el proveedor filtrado", async () => {
    render(<TestRouter initialEntries={["/suppliers"]}><SuppliersPage /></TestRouter>);
    const link = await screen.findByRole("link", { name: `Ver proveedor ${supplier.name}` });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", `/suppliers/${supplier.id}`);
    expect(link.tabIndex).toBe(0);
    link.focus();
    expect(link).toHaveFocus();
  });
});
