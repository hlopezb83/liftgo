import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenancePoliciesTab } from "../MaintenancePoliciesTab";

const mocks = vi.hoisted(() => ({
  options: { data: undefined as { id: string; name: string; model: string }[] | undefined, isReady: false, isLoading: true, isError: false, limitMessage: undefined as string | undefined, refetch: vi.fn() },
  policies: { data: [] as object[], isLoading: false, isError: false, refetch: vi.fn() },
  create: vi.fn(), update: vi.fn(), notify: vi.fn(), useOptions: vi.fn(),
}));
vi.mock("@/features/maintenance", () => ({
  useMaintenancePolicies: () => mocks.policies,
  useMaintenancePolicyOptions: (...args: unknown[]) => { mocks.useOptions(...args); return mocks.options; },
  useCreateMaintenancePolicy: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateMaintenancePolicy: () => ({ mutate: mocks.update, isPending: false }),
  useDeleteMaintenancePolicy: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/features/availability", () => ({ useServerTodayMty: () => "2026-11-08" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/dataTable/v2", () => ({ DataTableV2: () => null, useLiftgoTable: () => ({}) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyValidation: (...args: unknown[]) => mocks.notify(...args) }));
vi.mock("../MaintenanceBufferCard", () => ({ MaintenanceBufferCard: () => null }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.options = { data: undefined, isReady: false, isLoading: true, isError: false, limitMessage: undefined, refetch: vi.fn() };
  mocks.policies = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
});
const ready = () => { mocks.options = { ...mocks.options, data: [{ id: "f-1", name: "QA equipo", model: "Modelo QA" }], isReady: true, isLoading: false, isError: false }; };

describe("MaintenancePoliciesTab selector integration", () => {
  it("shows loading instead of false emptiness, blocks selection/save and supports error retry", () => {
    const { rerender } = render(<MaintenancePoliciesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva Póliza" }));
    expect(mocks.useOptions).toHaveBeenLastCalledWith("2026-11-08", null, true);
    expect(screen.getByText("Verificando montacargas…")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar póliza" })).toBeDisabled();
    expect(screen.queryByText("No hay montacargas rentados sin póliza disponibles.")).not.toBeInTheDocument();
    mocks.options = { ...mocks.options, isLoading: false, isError: true };
    rerender(<MaintenancePoliciesTab />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar póliza" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(mocks.options.refetch).toHaveBeenCalledOnce();
    expect(mocks.policies.refetch).toHaveBeenCalledOnce();
    ready(); mocks.options.data = [];
    rerender(<MaintenancePoliciesTab />);
    expect(screen.getByText("No hay montacargas rentados sin póliza disponibles.")).toBeInTheDocument();
  });

  it("explains an exhausted read budget without suggesting a partial list is usable", () => {
    mocks.options = { ...mocks.options, isLoading: false, isError: true, limitMessage: "La consulta de pólizas es demasiado grande para cargarla completa. No se mostraron resultados parciales." };
    render(<MaintenancePoliciesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva Póliza" }));
    expect(screen.getByRole("alert")).toHaveTextContent("demasiado grande");
    expect(screen.getByRole("alert")).toHaveTextContent("No se mostraron resultados parciales");
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar póliza" })).toBeDisabled();
  });

  it.each(["loading", "error"])("does not claim eligibility while policy list is %s", (status) => {
    ready();
    mocks.policies.isLoading = status === "loading"; mocks.policies.isError = status === "error";
    render(<MaintenancePoliciesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva Póliza" }));
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Agregar póliza" })).toBeDisabled();
  });

  it("keeps edited selection, blocks stale saves on refetch, and only saves a verified current option", () => {
    ready();
    mocks.policies.data = [{ id: "p-1", forklift_id: "f-1", forklift_name: "QA equipo", provider_name: "Proveedor QA", monthly_cost: 100, service_type: "Póliza de Mantenimiento", description: "", is_active: true }];
    const { rerender } = render(<MaintenancePoliciesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Editar póliza" }));
    expect(mocks.useOptions).toHaveBeenLastCalledWith("2026-11-08", "p-1", true);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    mocks.options = { ...mocks.options, data: undefined, isReady: false, isLoading: true };
    rerender(<MaintenancePoliciesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.update).not.toHaveBeenCalled();
    ready(); mocks.options.data = [];
    rerender(<MaintenancePoliciesTab />);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    ready();
    rerender(<MaintenancePoliciesTab />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ id: "p-1", forklift_id: "f-1", provider_name: "Proveedor QA" }), expect.any(Object));
  });
});
