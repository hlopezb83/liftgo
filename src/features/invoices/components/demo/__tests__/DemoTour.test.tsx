import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoTour } from "../DemoTour";

const state = vi.hoisted(() => ({
  role: "admin" as string | null, roleLoading: false, roleError: false, permissions: true,
  organization: { status: "ready", organizationId: "org-a", memberType: "internal" },
  fetching: false, error: false, missing: false, reads: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user-a" } }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => state.organization }));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: state.role, isLoading: state.roleLoading, isError: state.roleError }),
  useHasModuleAccess: () => state.permissions,
}));
vi.mock("../../../hooks/demo/useDemoEvidence", () => ({
  useDemoEvidence: (org: string, user: string, request: unknown) => {
    state.reads(org, user, request);
    return {
      isFetching: state.fetching, isError: state.error, isSuccess: !!request && !state.error,
      data: !request || state.missing ? null : {
        invoice: { id: "invoice-a", invoice_number: "QA-001", customer_name: "DEMO Pagado", issued_at: "2026-10-01", total: 100, moneda: "MXN" },
        paid: 100, balance: 0, payments: [{ id: "payment-a", payment_date: "2026-10-02" }],
      }, refetch: state.refetch,
    };
  },
}));
beforeEach(() => {
  state.role = "admin"; state.roleLoading = false; state.roleError = false; state.permissions = true;
  state.organization = { status: "ready", organizationId: "org-a", memberType: "internal" };
  state.fetching = false; state.error = false; state.missing = false;
  state.reads.mockClear(); state.refetch.mockClear();
});
function openAndVerify() {
  fireEvent.click(screen.getByRole("button", { name: "Recorrido demo" }));
  fireEvent.change(screen.getByLabelText("Folio de factura QA/DEMO existente"), { target: { value: "QA-001" } });
  fireEvent.click(screen.getByRole("button", { name: "Verificar ejemplo" }));
}

describe("guided demo", () => {
  it.each(["customer", "dispatcher", "ventas", "administrativo", "auditor", "mechanic", null])("does not mount or query for role %s", (role) => {
    state.role = role;
    render(<DemoTour />);
    expect(screen.queryByRole("button", { name: "Recorrido demo" })).not.toBeInTheDocument();
    expect(state.reads).not.toHaveBeenCalled();
  });

  it("fails closed while role, company or permissions are unresolved", () => {
    const { rerender } = render(<DemoTour />);
    state.roleLoading = true; rerender(<DemoTour />);
    expect(screen.queryByText("Recorrido demo")).not.toBeInTheDocument();
    state.roleLoading = false; state.roleError = true; rerender(<DemoTour />);
    expect(screen.queryByText("Recorrido demo")).not.toBeInTheDocument();
    state.roleError = false; state.permissions = false; rerender(<DemoTour />);
    expect(screen.queryByText("Recorrido demo")).not.toBeInTheDocument();
    state.permissions = true; state.organization.status = "loading"; rerender(<DemoTour />);
    expect(screen.queryByText("Recorrido demo")).not.toBeInTheDocument();
  });

  it("chooses, verifies, walks forward/back and resets only local presentation", () => {
    render(<DemoTour />);
    expect(state.reads).not.toHaveBeenCalled();
    openAndVerify();
    expect(state.reads).toHaveBeenLastCalledWith("org-a", "user-a", { folio: "QA-001", scenario: "paid" });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar recorrido" }));
    expect(screen.getByText("Paso 1 de 3 · Pagado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir factura QA-001 en otra pestaña" })).toHaveAttribute("href", "/invoices/invoice-a");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByText(/Cobrado:/)).toHaveTextContent("Saldo: $0.00 MXN");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("link", { name: "Abrir Resultados en otra pestaña" })).toHaveAttribute("href", "/income-statement");
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Paso 2 de 3 · Pagado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar recorrido" }));
    expect(screen.getByLabelText("Folio de factura QA/DEMO existente")).toHaveValue("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Pendiente"));
    expect(screen.getByLabelText("Pendiente")).toBeChecked();
    expect(state.reads).toHaveBeenLastCalledWith("org-a", "user-a", null);
  });

  it.each(["Salir del recorrido", "Cerrar", "Escape"])("dismisses via %s, restores focus and does not retain a previous example", async (exit) => {
    render(<DemoTour />);
    openAndVerify();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar recorrido" }));
    if (exit === "Escape") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: exit }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Recorrido demo" })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Recorrido demo" }));
    expect(screen.getByLabelText("Folio de factura QA/DEMO existente")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Iniciar recorrido" })).not.toBeInTheDocument();
  });

  it("requires fresh verification when the folio, scenario or company changes", () => {
    const { rerender } = render(<DemoTour />);
    openAndVerify();
    fireEvent.click(screen.getByLabelText("Parcial"));
    expect(screen.queryByRole("button", { name: "Iniciar recorrido" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Verificar ejemplo" }));
    fireEvent.change(screen.getByLabelText("Folio de factura QA/DEMO existente"), { target: { value: "QA-002" } });
    expect(screen.queryByRole("button", { name: "Iniciar recorrido" })).not.toBeInTheDocument();
    state.organization = { ...state.organization, organizationId: "org-b" }; rerender(<DemoTour />);
    expect(screen.getByLabelText("Folio de factura QA/DEMO existente")).toHaveValue("");
    expect(state.reads).toHaveBeenLastCalledWith("org-b", "user-a", null);
  });

  it("distinguishes verification loading, errors and missing fixtures without stale links", () => {
    const { rerender } = render(<DemoTour />);
    openAndVerify();
    state.fetching = true; rerender(<DemoTour />);
    expect(screen.getByText("Verificando documento y cobros…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar recorrido" })).not.toBeInTheDocument();
    state.fetching = false; state.error = true; rerender(<DemoTour />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo verificar");
    state.error = false; state.missing = true; rerender(<DemoTour />);
    expect(screen.getByText(/Falta un ejemplo verificable/)).toBeInTheDocument();
  });
  it("drops links immediately if authorization is withdrawn during the tour", () => {
    const { rerender } = render(<DemoTour />);
    openAndVerify();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar recorrido" }));
    state.role = "customer"; rerender(<DemoTour />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    state.role = "admin"; state.organization.memberType = "portal"; rerender(<DemoTour />);
    expect(screen.queryByRole("button", { name: "Recorrido demo" })).not.toBeInTheDocument();
  });

  it("re-verifies the same example on a repeated request without creating another operation", () => {
    render(<DemoTour />);
    openAndVerify();
    fireEvent.click(screen.getByRole("button", { name: "Verificar ejemplo" }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(state.reads).toHaveBeenLastCalledWith("org-a", "user-a", { folio: "QA-001", scenario: "paid" });
  });

});
