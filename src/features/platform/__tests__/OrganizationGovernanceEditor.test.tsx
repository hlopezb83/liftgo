import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationGovernance } from "@/lib/platformOrganizationGovernance.types";
const m = vi.hoisted(() => ({ save: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), validation: vi.fn() }));
vi.mock("@/lib/platformOrganizationGovernance.functions", () => ({
  setPlatformOrganizationGovernanceFn: m.save, getPlatformOrganizationGovernanceFn: vi.fn(), listPlatformOrganizationGovernanceFn: vi.fn(),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: m.error, notifySuccess: m.success, notifyInfo: m.info, notifyValidation: m.validation }));
import { OrganizationGovernanceEditor } from "../components/OrganizationGovernanceEditor";
const initial: OrganizationGovernance = { organizationId: "10100000-0000-4000-8000-000000000011",
  classification: "unclassified", city: null, territory: null, contactName: null, contactEmail: null, contactPhone: null, revision: "0", updatedAt: null };
function setup(reload = vi.fn().mockResolvedValue({ ...initial, revision: "1", city: "Saltillo" })) {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const close = vi.fn();
  const tree = (record = initial) => <QueryClientProvider client={cache}>
    <OrganizationGovernanceEditor initial={record} reload={reload} onClose={close} />
  </QueryClientProvider>;
  const view = render(tree());
  return { cache, close, reload, view, tree };
}
function fill() {
  fireEvent.change(screen.getByLabelText("Ciudad"), { target: { value: "Monterrey" } });
  fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Apertura revisada por operaciones" } });
}
describe("ficha concurrente: conservar captura y revisar antes de sobrescribir", () => {
  beforeEach(() => vi.resetAllMocks());
  it("preserva valores y motivo ante refetch/conflicto y sólo usa la revisión confirmada", async () => {
    m.save.mockRejectedValueOnce(Object.assign(new Error("Los datos cambiaron"), { status: 409 }));
    const { close, reload, view, tree, cache } = setup(); fill();
    view.rerender(tree({ ...initial, revision: "1", city: "Saltillo" }));
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Monterrey");
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    await screen.findByText("La ficha cambió mientras capturabas");
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeDisabled();
    expect(m.save.mock.calls[0][0].data.revision).toBe("0");
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar datos actuales" }));
    await screen.findByText("Saltillo"); expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Conservar mi captura y usar esta revisión" }));
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Monterrey");
    expect(screen.getByLabelText("Motivo del cambio")).toHaveValue("Apertura revisada por operaciones");
    m.save.mockResolvedValueOnce({ changed: true, governance: { ...initial, revision: "2", city: "Monterrey" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(m.save.mock.calls[1][0].data).toMatchObject({ city: "Monterrey", revision: "1" });
    expect(cache.getQueryData<OrganizationGovernance>(["platform", "organization-governance", initial.organizationId])?.revision).toBe("2");
    expect(m.error).toHaveBeenCalledWith(expect.objectContaining({ phase: "mutation" })); cache.clear();
  });
  it("consultar la revisión fallida no habilita guardar ni borra la captura", async () => {
    m.save.mockRejectedValue(Object.assign(new Error("Los datos cambiaron"), { status: 409 }));
    const { cache } = setup(vi.fn().mockRejectedValue(new Error("offline"))); fill();
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    await screen.findByText("La ficha cambió mientras capturabas");
    fireEvent.click(screen.getByRole("button", { name: "Revisar datos actuales" }));
    await screen.findByText(/No se pudieron consultar los datos actuales/);
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Monterrey");
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeDisabled();
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(m.error).toHaveBeenCalledWith(expect.objectContaining({ phase: "query", title: "No se pudo consultar la ficha actual" }));
    cache.clear();
  });
  it("valida el motivo sin enviar RPC y no cierra el diálogo durante el guardado", async () => {
    let finish!: (value: unknown) => void;
    m.save.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { close, cache } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    expect(m.validation).toHaveBeenCalled(); expect(m.save).not.toHaveBeenCalled();
    fill(); fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    finish({ changed: false, governance: initial });
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(m.info).toHaveBeenCalledWith("La empresa ya tiene estos datos"); cache.clear();
  });
});
