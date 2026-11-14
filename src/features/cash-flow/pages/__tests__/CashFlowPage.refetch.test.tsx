import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CashFlowSettings } from "../../lib/queryKeys";
import CashFlowPage from "../CashFlowPage";

const mocks = vi.hoisted(() => ({ readSettings: vi.fn<() => Promise<CashFlowSettings>>(), update: vi.fn(), projection: vi.fn() }));
vi.mock("../../hooks/useCashFlowSettings", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    useCashFlowSettings: () => useQuery({ queryKey: ["cashflow-settings-page-test"], queryFn: mocks.readSettings, retry: false }),
    useUpdateCashFlowSettings: () => ({ mutate: mocks.update, isPending: false }),
  };
});
vi.mock("../../hooks/useCashFlowProjection", () => ({ useCashFlowProjection: mocks.projection }));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }) }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => children }));
vi.mock("../../components/CashFlowWeekDetailSheet", () => ({ CashFlowWeekDetailSheet: () => null }));
vi.mock("../../components/CashFlowSummaryCards", () => ({ CashFlowSummaryCards: () => <p>Resumen disponible</p> }));

const initialSettings = { id: "company-a", initialBalance: 1000, safetyBuffer: 100 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSettings.mockResolvedValue(initialSettings);
  mocks.projection.mockReturnValue({ data: { buckets: [] }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(<QueryClientProvider client={client}><CashFlowPage /></QueryClientProvider>);
  return client;
}

it("keeps the mounted settings draft after a completed failed refetch and a successful retry", async () => {
  const client = mount();
  const initial = screen.getByLabelText("Saldo inicial (MXN)");
  const buffer = screen.getByLabelText("Colchón mínimo (MXN)");
  await waitFor(() => expect(initial).toHaveValue(1000));
  fireEvent.change(initial, { target: { value: "2500" } });
  fireEvent.change(buffer, { target: { value: "" } });
  mocks.readSettings.mockRejectedValue(new Error("Synthetic settings failure"));
  await act(async () => { await client.refetchQueries({ queryKey: ["cashflow-settings-page-test"], exact: true }); });
  expect(await screen.findByText("No se pudo cargar la configuración de flujo de caja")).toBeInTheDocument();
  expect(client.getQueryState(["cashflow-settings-page-test"])?.status).toBe("error");
  expect(screen.getByLabelText("Saldo inicial (MXN)")).toBe(initial);
  expect(screen.getByLabelText("Colchón mínimo (MXN)")).toBe(buffer);
  expect(initial).toHaveValue(2500);
  expect(buffer).toHaveValue(null);
  expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  expect(screen.queryByText("Resumen disponible")).not.toBeInTheDocument();
  expect(mocks.projection).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));

  mocks.readSettings.mockResolvedValue({ ...initialSettings, initialBalance: 1100, safetyBuffer: 150 });
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(screen.queryByText("No se pudo cargar la configuración de flujo de caja")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Saldo inicial (MXN)")).toBe(initial);
  expect(initial).toHaveValue(2500);
  expect(buffer).toHaveValue(null);
  expect(screen.getByText(/Conservamos tus cambios/)).toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.change(buffer, { target: { value: "175" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ id: "company-a", initialBalance: 2500, safetyBuffer: 175 }, expect.any(Object));
});

it("keeps initial failure without cached settings separate from editable values and recovers through retry", async () => {
  mocks.readSettings.mockRejectedValue(new Error("Synthetic initial failure"));
  mount();
  expect(await screen.findByText("No se pudo cargar la configuración de flujo de caja")).toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.queryByText("Resumen disponible")).not.toBeInTheDocument();
  mocks.readSettings.mockResolvedValue(initialSettings);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(1000));
  expect(screen.getByLabelText("Colchón mínimo (MXN)")).toHaveValue(100);
  expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it("preserves disabled inputs during initial loading without presenting a zero projection", async () => {
  let resolve!: (value: CashFlowSettings) => void;
  mocks.readSettings.mockReturnValue(new Promise<CashFlowSettings>((done) => { resolve = done; }));
  mount();
  expect(screen.getByLabelText("Saldo inicial (MXN)")).toBeDisabled();
  expect(screen.getByLabelText("Colchón mínimo (MXN)")).toBeDisabled();
  expect(screen.queryByText("Resumen disponible")).not.toBeInTheDocument();
  expect(mocks.projection).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
  await act(async () => { resolve(initialSettings); });
  await waitFor(() => expect(screen.getByLabelText("Saldo inicial (MXN)")).toHaveValue(1000));
  expect(screen.getByLabelText("Saldo inicial (MXN)")).toBeEnabled();
});
