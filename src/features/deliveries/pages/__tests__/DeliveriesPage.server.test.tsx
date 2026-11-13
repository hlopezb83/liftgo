import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import type { DeliveriesFilters } from "../../hooks/useDeliveriesPage";
import DeliveriesPage from "../DeliveriesPage";

const state = vi.hoisted(() => ({ mobile: false, error: false, loading: false, retry: vi.fn(), requests: [] as DeliveriesFilters[] }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile, useIsTabletOrBelow: () => state.mobile }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("@/features/fleet", () => ({ useForkliftMap: () => { throw new Error("General page must not load the whole fleet"); } }));
vi.mock("../../components/deliveries/DeliveryFormDialog", () => ({ DeliveryFormDialog: () => null }));
vi.mock("../../hooks/useOverdueDeliveriesPage", () => ({ useOverdueDeliveriesPage: () => { throw new Error("General page must not call overdue RPC"); } }));
vi.mock("../../hooks/useDeliveries", () => ({
  useDeliveries: () => { throw new Error("General page must not load the capped legacy list"); },
  deliveryQueries: { detail: vi.fn() },
}));
vi.mock("../../hooks/useDeliveriesPage", () => ({
  useDeliveriesPage: (filters: DeliveriesFilters) => {
    state.requests.push(filters);
    const rows = Array.from({ length: 1202 }, (_, index) => ({
      id: `delivery-${index}`, delivery_number: `ENT-${String(index + 1).padStart(4, "0")}`,
      type: index === 1201 ? "pickup" : "delivery", status: index === 1201 ? "completed" : "scheduled",
      forklift_id: "unit-1", forklifts: { name: "Unidad A" }, scheduled_date: "2026-11-09",
      scheduled_time: null, address: null, driver_name: index === 1201 ? "Operador final" : "Operador",
      historical_reconciliation: index === 1200 ? { revoked_at: null } : null,
    })).filter((row) => (!filters.search || `${row.delivery_number} ${row.driver_name}`.toLowerCase().includes(filters.search.toLowerCase())) &&
      (filters.status === "all" || row.status === filters.status) && (filters.type === "all" || row.type === filters.type) &&
      (filters.history === "history" || (filters.history === "reconciled" ? row.historical_reconciliation !== null : row.historical_reconciliation === null)));
    if (filters.sorting.some(({ id, desc }) => id === "delivery_number" && desc)) rows.reverse();
    const pageIndex = Math.min(filters.pageIndex, Math.max(0, Math.ceil(rows.length / filters.pageSize) - 1));
    return {
      data: state.loading || state.error ? undefined : { items: rows.slice(pageIndex * filters.pageSize, (pageIndex + 1) * filters.pageSize), totalCount: rows.length, pageIndex, overdueCount: 1200, today: "2026-11-10" },
      isLoading: state.loading, isError: state.error, refetch: state.retry,
    };
  },
}));

function Harness() {
  const location = useLocation();
  return <>
    {location.pathname === "/deliveries" ? <DeliveriesPage /> : <DetailPageHeader title="Detalle" backTo="/deliveries" />}
    <output data-testid="url">{location.pathname}{location.search}</output>
  </>;
}
function mount(origin = "/deliveries") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TestRouter initialEntries={[origin]}><Harness /></TestRouter></QueryClientProvider>);
}
beforeEach(() => {
  state.mobile = false; state.error = false; state.loading = false; state.requests = []; state.retry.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe.each([false, true])("General transport page, mobile=%s", (mobile) => {
  beforeEach(() => { state.mobile = mobile; });
  it("shows the exact total and reaches the last page beyond 1001 without loading capped lists or fleet", async () => {
    mount();
    expect(await screen.findByText("1–25 de 1201")).toBeInTheDocument();
    expect(screen.getByText(/Hay 1200 transportes atrasados/)).toBeInTheDocument();
    expect(screen.getAllByText("Atrasada · 1 día")).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página 49" }));
    expect(await screen.findByText("1201–1201 de 1201")).toBeInTheDocument();
    expect(screen.getByText("ENT-1202")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a la página siguiente" })).toBeDisabled();
  });
  it("searches beyond the former cap, resets the page, and clears an empty result", async () => {
    mount("/deliveries?tablePage=10");
    fireEvent.change(await screen.findByRole("searchbox", { name: "Buscar entregas…" }), { target: { value: "final" } });
    expect(await screen.findByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.getByText("ENT-1202")).toBeInTheDocument();
    expect(state.requests.at(-1)).toMatchObject({ search: "final", pageIndex: 0 });
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar entregas…" }), { target: { value: "absent" } });
    expect(await screen.findByText("No hay resultados con los filtros actuales")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Limpiar filtros" }).at(-1)!);
    expect(await screen.findByText("1–25 de 1201")).toBeInTheDocument();
  });
  it("restores page, history and sort from the URL when returning from a detail", async () => {
    const sort = [{ id: "delivery_number", desc: false }];
    mount(`/deliveries?history=history&tablePage=48&tableSize=25&tableSort=${encodeURIComponent(JSON.stringify(sort))}`);
    fireEvent.click(await screen.findByText("ENT-1202"));
    expect(await screen.findByText("Detalle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByText("1201–1202 de 1202")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("history=history");
    expect(screen.getByTestId("url")).toHaveTextContent("tablePage=48");
    expect(state.requests.at(-1)?.sorting).toEqual(sort);
  });
  it("distinguishes loading, failure and empty, then clamps a filtered page", async () => {
    state.loading = true;
    mount();
    expect(await screen.findByRole("heading", { name: "Entregas" })).toBeInTheDocument();
    expect(screen.queryByText(/0 resultados/)).toBeNull();
    expect(screen.queryByText("No hay entregas programadas")).toBeNull();
    cleanup(); state.loading = false; state.error = true;
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/0 resultados/)).toBeNull();
    cleanup(); state.error = false;
    mount("/deliveries?q=final&status=completed&type=pickup&tablePage=99");
    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("tablePage=0"));
    expect(screen.getByText("ENT-1202")).toBeInTheDocument();
    expect(state.requests.at(-1)).toMatchObject({ search: "final", status: "completed", type: "pickup" });
  });
  it("requests the reconciled view before pagination and shows its label", async () => {
    mount("/deliveries?history=reconciled");
    expect(await screen.findByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.getByText("ENT-1201")).toBeInTheDocument();
    expect(screen.getAllByText("Conciliada históricamente").length).toBeGreaterThan(0);
    expect(state.requests.at(-1)?.history).toBe("reconciled");
  });
});

it("sends sorting to the server query and retains accessible native row links", async () => {
  mount();
  const link = await screen.findByRole("link", { name: "Ver transporte ENT-0001" });
  expect(link).toHaveAttribute("href", "/deliveries/delivery-0");
  expect(link.closest("tr")).not.toHaveAttribute("role", "button");
  fireEvent.click(screen.getByRole("button", { name: "Entrega #" }));
  await waitFor(() => expect(state.requests.at(-1)?.sorting).toEqual([{ id: "delivery_number", desc: false }]));
  fireEvent.click(screen.getByRole("button", { name: "Entrega #" }));
  expect(await screen.findByText("ENT-1202")).toBeInTheDocument();
});
