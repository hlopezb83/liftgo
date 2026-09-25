import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomersPage from "../CustomersPage";

const state = vi.hoisted(() => ({ search: "", canWrite: true, create: vi.fn(), link: vi.fn() }));
vi.mock("@/components/dataTable/v2", () => ({ useLiftgoTable: () => ({}) }));
vi.mock("@/components/layout/ListPageLayout", () => ({
  ListPageLayout: ({ actions }: { actions: ReactNode }) => <>{actions}</>,
}));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: vi.fn() }));
vi.mock("@/features/crm", () => ({ useUpdateProspect: () => ({ mutate: state.link }) }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => state.canWrite }));
vi.mock("@/hooks/filters/useTableFilters", () => ({
  useTableFilters: () => ({ values: { q: "" }, set: vi.fn(), reset: vi.fn(), hasActive: false, filtered: [] }),
}));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("@/lib/router-compat", () => ({
  useSearchParams: () => [new URLSearchParams(state.search), (params: URLSearchParams | Record<string, string>) => {
    state.search = new URLSearchParams(params).toString();
  }],
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn() }));
vi.mock("../../hooks/customers/useCustomersColumns", () => ({ useCustomersColumns: () => [] }));
vi.mock("../../hooks/customers/useCustomers", () => ({
  useCustomers: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateCustomer: () => ({ mutate: state.create, isPending: false }),
  useUpdateCustomer: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../components/customers/CustomerMobileCard", () => ({ CustomerMobileCard: () => null }));
vi.mock("../../components/customers/CustomersToolbar", () => ({
  CustomersActions: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>Nuevo cliente</button>,
  CustomersSecondaryActions: () => null,
  CustomersFilters: () => null,
}));
vi.mock("../../components/customers/CustomerFormDialog", () => ({
  CustomerFormDialog: ({ open, onOpenChange, onSubmit, initialData }: {
    open: boolean; onOpenChange: (open: boolean) => void;
    onSubmit: (data: { name: string }) => void; initialData?: { name?: string };
  }) => open ? (
    <div role="dialog" aria-label="Alta de cliente">
      <p>{initialData?.name ?? "Alta independiente"}</p>
      <button onClick={() => onOpenChange(false)}>Cancelar</button>
      <button onClick={() => onSubmit({ name: initialData?.name ?? "Cliente independiente" })}>Guardar cliente</button>
    </div>
  ) : null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.search = "";
  state.canWrite = true;
});
afterEach(cleanup);

async function finishCreate() {
  fireEvent.click(screen.getByRole("button", { name: "Guardar cliente" }));
  await act(async () => { state.create.mock.calls[0][1].onSuccess({ id: "customer-new" }); });
}

describe("CustomersPage — origen del alta", () => {
  it("cancelar una conversión no vincula el siguiente cliente independiente al prospecto anterior", async () => {
    state.search = "from_prospect=true&prospect_id=prospect-1&company=Origen";
    render(<CustomersPage />);
    expect(screen.getByText("Origen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    expect(screen.getByText("Alta independiente")).toBeInTheDocument();
    await finishCreate();
    expect(state.link).not.toHaveBeenCalled();
  });

  it("una conversión guardada conserva la vinculación al prospecto correcto", async () => {
    state.search = "from_prospect=true&prospect_id=prospect-1&company=Origen";
    render(<CustomersPage />);
    await finishCreate();
    expect(state.link).toHaveBeenCalledWith(
      { id: "prospect-1", customer_id: "customer-new" }, expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("el acceso rápido abre un alta limpia aunque la página ya estuviera montada", () => {
    const { rerender } = render(<CustomersPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    state.search = "new=1";
    rerender(<CustomersPage />);
    expect(screen.getByRole("dialog", { name: "Alta de cliente" })).toBeInTheDocument();
    expect(screen.getByText("Alta independiente")).toBeInTheDocument();
    expect(state.search).toBe("");
  });

  it("una URL de alta no abre el formulario para un rol sin permiso de escritura", () => {
    state.canWrite = false;
    state.search = "new=1";
    render(<CustomersPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(state.create).not.toHaveBeenCalled();
  });
});
