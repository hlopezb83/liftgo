import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { customerKeys } from "../../lib/queryKeys";
import CustomerDetailPage from "../CustomerDetailPage";
import type { CustomerSummary } from "../../lib/customerTypes";

const state = vi.hoisted(() => ({ read: vi.fn(), pdf: vi.fn(), archive: vi.fn(), financial: true, access: "full" }));
const id = "00000000-0000-4000-8000-000000000031";
const summary: CustomerSummary = { bookings: [], invoices: [], totals: { total_invoiced: 1500, total_paid: 400, outstanding_revenue: 1100 } };
vi.mock("@/lib/rpc", () => ({ callRpc: () => state.read() }));
vi.mock("@/lib/pdf/customerStatement", () => ({ exportCustomerStatementPdf: state.pdf }));
vi.mock("@/features/users", () => ({
  useHasFinancialAccess: () => state.financial,
  useUserRole: () => ({ data: "admin" }), useRolePermissions: () => ({ data: {} }),
  getAccessLevel: () => state.access,
  useHasModuleAccess: (_module: string, minimum: string) => minimum === "full" ? state.access === "full" : state.access !== "none",
}));
vi.mock("../../hooks/customers/useCustomers", () => ({
  useCustomer: () => ({ data: { id, name: "QA Cliente", notes: "Contacto disponible" }, isLoading: false, isError: false, refetch: vi.fn() }),
  useCustomerPortalAccount: () => ({ data: null }),
}));
vi.mock("../../hooks/customers/useCustomerProfitability", () => ({ useCustomerProfitability: () => ({ data: undefined }) }));
vi.mock("../../hooks/customerDetail/useCustomerDetailActions", () => ({ useCustomerDetailActions: () => ({
  updateCustomer: { isPending: false }, deleteCustomer: { isPending: false }, inviteCustomer: { isPending: false },
  handleDelete: state.archive, handleEditSubmit: vi.fn(), handleInvite: vi.fn(), setInviteResult: vi.fn(),
}) }));
vi.mock("../../components/customer-detail/CustomerContactCard", () => ({ CustomerContactCard: () => <p>Ficha de contacto disponible</p> }));
vi.mock("../../components/customers/CustomerFormDialog", () => ({ CustomerFormDialog: () => null }));
vi.mock("../../components/customer-detail/CustomerInviteDialog", () => ({ CustomerInviteDialog: () => null }));

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  render(<QueryClientProvider client={queryClient}><TestRouter initialEntries={[`/customers/${id}`]} path="/customers/$id">
    <CustomerDetailPage />
  </TestRouter></QueryClientProvider>);
  return queryClient;
}
beforeEach(() => {
  vi.clearAllMocks(); state.financial = true; state.access = "full";
  state.read.mockResolvedValue(summary);
});
afterEach(cleanup);

describe("estado del resumen de cliente", () => {
  it("mientras carga conserva el contacto y no muestra ceros ni historiales vacíos", async () => {
    let resolve!: (value: CustomerSummary) => void;
    state.read.mockImplementation(() => new Promise<CustomerSummary>(done => { resolve = done; }));
    setup();
    expect(await screen.findByRole("status", { name: "Cargando resumen del cliente" })).toBeInTheDocument();
    expect(screen.getByText("Ficha de contacto disponible")).toBeInTheDocument();
    expect(screen.queryByText("Resumen Financiero")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin reservas aún")).not.toBeInTheDocument();
    expect(screen.queryByText("Sin facturas aún")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estado de Cuenta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    await act(async () => resolve(summary));
    expect(await screen.findByText("$1,500.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estado de Cuenta" })).toBeEnabled();
  });

  it("un error después del éxito oculta el resumen cacheado, bloquea acciones y permite reintentar", async () => {
    const client = setup();
    await screen.findByText("$1,500.00");
    fireEvent.click(screen.getByRole("button", { name: "Estado de Cuenta" }));
    await waitFor(() => expect(state.pdf).toHaveBeenCalledOnce());
    state.read.mockRejectedValue(new Error("Fallo de resumen"));
    await act(async () => { await client.refetchQueries({ queryKey: customerKeys.summary(id) }); });
    expect(await screen.findByText("No se pudo cargar el resumen del cliente")).toBeInTheDocument();
    expect(client.getQueryData(customerKeys.summary(id))).toEqual(summary);
    expect(screen.queryByText("Resumen Financiero")).not.toBeInTheDocument();
    expect(screen.queryByText("Historial de Reservas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estado de Cuenta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Estado de Cuenta" }));
    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    expect(state.pdf).toHaveBeenCalledOnce();
    expect(state.archive).not.toHaveBeenCalled();

    state.read.mockResolvedValue({ bookings: [], invoices: [], totals: { total_invoiced: 0, total_paid: 0, outstanding_revenue: 0 } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Resumen Financiero");
    expect(screen.getAllByText("$0.00")).toHaveLength(3);
    expect(screen.getByText("Sin reservas aún")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeEnabled();
  });

  it("el error inicial permite recuperar el resumen sin ampliar permisos", async () => {
    state.financial = false; state.access = "read";
    state.read.mockRejectedValue(new Error("Fallo inicial"));
    setup();
    await screen.findByText("No se pudo cargar el resumen del cliente");
    expect(screen.queryByRole("button", { name: "Estado de Cuenta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
    state.read.mockResolvedValue(summary);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Historial de Reservas");
    expect(screen.queryByText("Resumen Financiero")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Estado de Cuenta" })).not.toBeInTheDocument();
  });
});
