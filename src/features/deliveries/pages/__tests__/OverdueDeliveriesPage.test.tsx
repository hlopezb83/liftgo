import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import type { OverdueDeliveriesFilters } from "../../hooks/useOverdueDeliveriesPage";
import DeliveriesPage from "../DeliveriesPage";

const state = vi.hoisted(() => ({ mobile: false, error: false, loading: false, retry: vi.fn(), requests: [] as OverdueDeliveriesFilters[] }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => state.mobile, useIsTabletOrBelow: () => state.mobile }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("@/features/fleet", () => ({ useForkliftMap: () => { throw new Error("Overdue page must not load the whole fleet"); } }));
vi.mock("../../components/deliveries/DeliveryFormDialog", () => ({ DeliveryFormDialog: () => null }));
vi.mock("../../hooks/useDeliveries", () => ({
  useDeliveries: () => { throw new Error("Overdue page must not load the capped legacy list"); },
  deliveryQueries: { detail: vi.fn() },
}));
vi.mock("../../hooks/useOverdueDeliveriesPage", () => ({
  useOverdueDeliveriesPage: (filters: OverdueDeliveriesFilters) => {
    state.requests.push(filters);
    const rows = Array.from({ length: 602 }, (_, index) => ({
      id: `delivery-${index}`, delivery_number: `ENT-${String(index + 1).padStart(4, "0")}`,
      type: index % 2 === 0 ? "delivery" : "pickup", status: index % 2 === 0 ? "scheduled" : "in_transit",
      forklift_id: "unit-1", forklifts: { name: "Unidad A" }, scheduled_date: "2026-11-09",
      scheduled_time: null, address: null, driver_name: index === 601 ? "Operador final" : "Operador",
    })).filter((row) => (!filters.search || `${row.delivery_number} ${row.driver_name}`.toLowerCase().includes(filters.search.toLowerCase())) &&
      (filters.status === "all" || row.status === filters.status) && (filters.type === "all" || row.type === filters.type));
    if (filters.sorting.some(({ id, desc }) => id === "delivery_number" && desc)) rows.reverse();
    const pageIndex = Math.min(filters.pageIndex, Math.max(0, Math.ceil(rows.length / filters.pageSize) - 1));
    return {
      data: state.loading || state.error ? undefined : { items: rows.slice(pageIndex * filters.pageSize, (pageIndex + 1) * filters.pageSize), totalCount: rows.length, pageIndex, today: "2026-11-10" },
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
function mount(origin = "/deliveries?view=overdue") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TestRouter initialEntries={[origin]}><Harness /></TestRouter></QueryClientProvider>);
}
beforeEach(() => {
  state.mobile = false; state.error = false; state.loading = false; state.requests = []; state.retry.mockReset();
  sessionStorage.clear();
});
afterEach(cleanup);

describe.each([false, true])("Overdue transport page, mobile=%s", (mobile) => {
  beforeEach(() => { state.mobile = mobile; });
  it("renders the full total and pages beyond 500 without downloading capped lists or fleet", async () => {
    mount();
    expect(await screen.findByText("1–25 de 602")).toBeInTheDocument();
    expect(screen.getByText(/Vista Atrasados: programados o en tránsito/)).toHaveTextContent("10/11/2026");
    expect(screen.getAllByText("Atrasada · 1 día")).toHaveLength(25);
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página 25" }));
    expect(await screen.findByText("601–602 de 602")).toBeInTheDocument();
    expect(screen.getByText("ENT-0602")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ir a la página siguiente" })).toBeDisabled();
  });
  it("keeps the overdue view when searching/clearing, and searches beyond the former cap", async () => {
    mount("/deliveries?view=overdue&tablePage=10");
    fireEvent.change(await screen.findByRole("searchbox", { name: "Buscar transportes atrasados…" }), { target: { value: "final" } });
    expect(await screen.findByText("1–1 de 1")).toBeInTheDocument();
    expect(screen.getByText("ENT-0602")).toBeInTheDocument();
    expect(state.requests.at(-1)).toMatchObject({ search: "final", pageIndex: 0 });
    // The filtered empty state exposes a clear action outside the mobile filter sheet.
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar transportes atrasados…" }), { target: { value: "absent" } });
    expect(await screen.findByText("No hay resultados con los filtros actuales")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Limpiar filtros" }).at(-1)!);
    expect(await screen.findByText("1–25 de 602")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("view=overdue");
  });
  it("restores the overdue view and page when returning from a detail", async () => {
    mount("/deliveries?view=overdue&tablePage=24&tableSize=25");
    fireEvent.click(await screen.findByText("ENT-0602"));
    expect(await screen.findByText("Detalle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByText("601–602 de 602")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("view=overdue");
    expect(screen.getByTestId("url")).toHaveTextContent("tablePage=24");
  });
  it("distinguishes loading, error and empty without a provisional zero", async () => {
    state.loading = true;
    mount();
    expect(await screen.findByRole("heading", { name: "Transportes atrasados" })).toBeInTheDocument();
    expect(screen.queryByText(/0 resultados/)).toBeNull();
    expect(screen.queryByText("No hay transportes atrasados")).toBeNull();
    cleanup(); state.loading = false; state.error = true;
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/0 resultados/)).toBeNull();
    cleanup(); state.error = false;
    mount("/deliveries?view=overdue&q=final&tablePage=99");
    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("tablePage=0"));
    expect(screen.getByText("ENT-0602")).toBeInTheDocument();
  });
});

it("sends column sorting to the page query", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Entrega #" }));
  await waitFor(() => expect(state.requests.at(-1)?.sorting).toEqual([{ id: "delivery_number", desc: false }]));
  fireEvent.click(screen.getByRole("button", { name: "Entrega #" }));
  expect(await screen.findByText("ENT-0602")).toBeInTheDocument();
});
