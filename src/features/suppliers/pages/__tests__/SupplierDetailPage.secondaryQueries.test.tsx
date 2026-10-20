import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import SupplierDetailPage from "../SupplierDetailPage";

const queries = vi.hoisted(() => {
  const query = () => ({ data: undefined as Record<string, unknown>[] | undefined,
    isError: false, isLoading: false, isFetching: false, error: null, refetch: vi.fn() });
  return { bills: query(), maintenance: query() };
});
vi.mock("../../hooks/useSuppliers", () => ({
  useSupplier: () => ({ data: { id: "sp-1", name: "QA Supplier", notes: "" }, isLoading: false, isError: false, refetch: vi.fn() }),
  SUPPLIER_CATEGORIES: {},
}));
vi.mock("@/features/accounts-payable", () => ({ useSupplierBills: () => queries.bills }));
vi.mock("@/features/maintenance", () => ({ useMaintenanceLogs: () => queries.maintenance }));
vi.mock("@/features/fleet", () => ({ useForkliftMap: () => ({ forkliftMap: new Map() }), DocumentAttachments: () => null }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("../../components/suppliers/SupplierContactsSection", () => ({ SupplierContactsSection: () => null }));
vi.mock("../../components/suppliers/SupplierBankAccountsSection", () => ({ SupplierBankAccountsSection: () => null }));
vi.mock("../../components/suppliers/SupplierFormDialog", () => ({ SupplierFormDialog: () => null }));
afterEach(cleanup);
beforeEach(() => {
  for (const query of Object.values(queries)) {
    Object.assign(query, { data: undefined, isError: false, isLoading: false, isFetching: false });
    query.refetch.mockReset();
  }
});
function RefreshablePage() {
  const [, refresh] = useReducer(value => value + 1, 0);
  return <><button onClick={refresh}>Refresh queries</button><SupplierDetailPage /></>;
}
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}>
    <TestRouter initialEntries={["/suppliers/sp-1"]} path="/suppliers/$id"><RefreshablePage /></TestRouter>
  </QueryClientProvider>);
  return { ...result, refresh: () => fireEvent.click(screen.getByText("Refresh queries")) };
}

describe("QR01: supplier secondary query availability", () => {
  it("shows loading rather than zero totals or false empty messages", async () => {
    queries.bills.isLoading = true; queries.maintenance.isLoading = true;
    renderPage();
    expect(await screen.findByText("QA Supplier")).toBeInTheDocument();
    expect(screen.getByText("Cargando gastos…")).toHaveAttribute("role", "status");
    expect(screen.getByText("Cargando mantenimiento…")).toHaveAttribute("role", "status");
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin gastos vinculados")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin mantenimiento vinculado")).not.toBeInTheDocument();
  });

  it("shows independent errors and retries the correct source, then recovers", async () => {
    queries.bills.isError = true; queries.maintenance.isError = true;
    const view = renderPage();
    expect(await screen.findByText("No se pudo cargar los gastos vinculados")).toBeInTheDocument();
    expect(screen.getByText("No se pudo cargar el mantenimiento vinculado")).toBeInTheDocument();
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin gastos vinculados")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin mantenimiento vinculado")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Reintentar" })[0]);
    expect(queries.bills.refetch).toHaveBeenCalledOnce();
    expect(queries.maintenance.refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Reintentar" })[1]);
    expect(queries.maintenance.refetch).toHaveBeenCalledOnce();
    queries.bills.isError = false; queries.bills.data = [];
    queries.maintenance.isError = false; queries.maintenance.data = [];
    view.refresh();
    expect(await screen.findByText("Sin gastos vinculados")).toBeInTheDocument();
    expect(screen.getByText("Sin mantenimiento vinculado")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.queryByText("No disponible")).not.toBeInTheDocument();
  });

  it("keeps a successful empty source visible when the other fails", async () => {
    queries.bills.data = []; queries.maintenance.isError = true;
    renderPage();
    expect(await screen.findByText("Sin gastos vinculados")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00")).toHaveLength(1);
    expect(screen.getByText("No se pudo cargar el mantenimiento vinculado")).toBeInTheDocument();
    expect(screen.queryByText("Sin mantenimiento vinculado")).not.toBeInTheDocument();
  });

  it("does not display cached totals as reliable after a failed refetch", async () => {
    queries.bills.data = [{ id: "bill-1", supplier_id: "sp-1", status: "sent", total: 120, currency: "MXN", exchange_rate: 1 }];
    queries.bills.isError = true; queries.maintenance.data = [];
    renderPage();
    expect(await screen.findByText("No se pudo cargar los gastos vinculados")).toBeInTheDocument();
    expect(screen.queryByText("$120.00")).not.toBeInTheDocument();
    expect(screen.getByText("Sin mantenimiento vinculado")).toBeInTheDocument();
  });

  it("preserves valid totals, supplier filtering, cancellation exclusion and currency conversion", async () => {
    queries.bills.data = [
      { id: "bill-1", supplier_id: "sp-1", status: "sent", total: 120, currency: "MXN", exchange_rate: 1, issue_date: "2026-10-20" },
      { id: "bill-2", supplier_id: "sp-1", status: "sent", total: 50, currency: "USD", exchange_rate: 20, issue_date: "2026-10-20" },
      { id: "bill-3", supplier_id: "sp-1", status: "cancelled", total: 999, currency: "MXN", exchange_rate: 1 },
      { id: "bill-4", supplier_id: "sp-other", status: "sent", total: 999, currency: "MXN", exchange_rate: 1 },
    ];
    queries.maintenance.data = [
      { id: "log-1", supplier_id: "sp-1", cost: 50, performed_at: "2026-10-20", forklift_id: "forklift-1", service_type: "QA" },
      { id: "log-2", supplier_id: "sp-other", cost: 999 },
    ];
    renderPage();
    expect(await screen.findByText("$1,120.00")).toBeInTheDocument();
    expect(screen.getByText("2 registro(s)")).toBeInTheDocument();
    expect(screen.getByText("1 registro(s)")).toBeInTheDocument();
    expect(screen.getAllByText("$50.00")).toHaveLength(2);
    expect(screen.queryByText("$999.00")).not.toBeInTheDocument();
  });

});
