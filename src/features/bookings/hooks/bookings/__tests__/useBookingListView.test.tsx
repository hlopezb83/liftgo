import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useLocation } from "@/lib/router-compat";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { TestRouter } from "@/test/router";
import { useBookingListView } from "../useBookingListView";
import { bookingPageQueryOptions } from "../useBookingPage";
import BookingsPage from "../../../pages/BookingsPage";

let requests: ChainCall[][] = [];
let rows: { id: string; customer_name: string; booking_number: string; status: string; start_date?: string; end_date?: string }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: {
    bookings: (calls) => { requests.push(calls); return { data: rows, count: 1001, error: null }; },
  } }),
}));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", organizationId: "org-a" }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false, useIsTabletOrBelow: () => false }));
vi.mock("@/contexts/pageActions", () => ({ usePageActions: () => undefined }));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }) }));

beforeEach(() => {
  requests = [];
  rows = [{ id: "qa-1", customer_name: "Acme", booking_number: "RES-1", status: "confirmed", start_date: "2026-11-12", end_date: "2026-11-15" }];
  window.sessionStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  // The UTC day has advanced, but Monterrey is still November 11.
  vi.setSystemTime(new Date("2026-11-12T04:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function Probe() {
  const list = useBookingListView();
  const navigate = useNavigateTransition();
  return <>
    <output data-testid="list">{JSON.stringify({ values: list.values, visible: list.filtered.length, raw: list.query.data?.items.length })}</output>
    <button onClick={() => list.setView("upcoming")}>Próximas reservas</button>
    <button onClick={() => list.setView("all")}>Todas las reservas</button>
    <button onClick={() => navigate("/bookings/qa-1")}>Abrir reserva</button>
  </>;
}

function setup(origin: string, showPage = false) {
  function Screen() {
    const location = useLocation();
    return <><output data-testid="url">{location.pathname + location.search}</output>
      {location.pathname === "/bookings" ? showPage ? <BookingsPage /> : <Probe /> : <DetailPageHeader title="Reserva QA" backTo="/bookings" />}
    </>;
  }
  const { Wrapper } = createQueryWrapper();
  render(<Wrapper><TestRouter initialEntries={[origin]}><Screen /></TestRouter></Wrapper>);
}

describe("Próximas reservas", () => {
  it("applies MTY cutoff, eligible statuses and user filters before the server limit", async () => {
    const client = new QueryClient();
    await client.fetchQuery(bookingPageQueryOptions("org-a", { q: " Acme,()%_ ", status: "confirmed", upcoming: true, pageIndex: 0, pageSize: 25, sorting: [] }));
    const calls = requests[0];
    const operations = calls.map((call) => [call.method, ...call.args]);
    expect(operations).toEqual(expect.arrayContaining([
      ["or", "is_e2e.is.null,is_e2e.eq.false"], ["eq", "organization_id", "org-a"],
      ["gte", "start_date", "2026-11-11"], ["eq", "status", "confirmed"],
      ["or", "customer_name.ilike.%Acme%,booking_number.ilike.%Acme%"],
      ["order", "start_date", { ascending: true, nullsFirst: false }], ["order", "id", { ascending: true }],
    ]));
    expect(operations.at(-1)).toEqual(["range", 0, 24]);
    expect(requests).toHaveLength(1);
    client.clear();
  });

  it("keeps today and the view in cache identity", () => {
    const filter = { q: "", status: "all", upcoming: true, pageIndex: 0, pageSize: 25, sorting: [] };
    expect(bookingPageQueryOptions("org-a", filter, "2026-11-11").queryKey).not.toEqual(bookingPageQueryOptions("org-a", filter, "2026-11-12").queryKey);
  });

  it("Todos filters on the server before fetching the page", async () => {
    setup("/bookings?q=otra&status=confirmed");
    await waitFor(() => expect(screen.getByTestId("list")).toHaveTextContent('"raw":1'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContainEqual({ method: "eq", args: ["status", "confirmed"] });
    expect(requests[0]).toContainEqual({ method: "or", args: ["customer_name.ilike.%otra%,booking_number.ilike.%otra%"] });
    expect(requests[0]).toContainEqual({ method: "range", args: [0, 24] });
  });

  it("changes view without dropping search/status and resets previous sorting/page", async () => {
    setup('/bookings?q=Acme&status=confirmed&tablePage=3&tableSort=%5B%7B%22id%22%3A%22end_date%22%2C%22desc%22%3Atrue%7D%5D');
    fireEvent.click(await screen.findByRole("button", { name: "Próximas reservas" }));
    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("/bookings?q=Acme&status=confirmed&view=upcoming"));
    expect(screen.getByTestId("list")).toHaveTextContent('"status":"confirmed"');
    expect(screen.getByTestId("url")).not.toHaveTextContent("tableSort");
    expect(screen.getByTestId("url")).not.toHaveTextContent("tablePage");
    fireEvent.click(screen.getByRole("button", { name: "Todas las reservas" }));
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/bookings?q=Acme&status=confirmed"));
  });

  it("restores view, status and table state through the existing detail back navigation", async () => {
    const origin = "/bookings?view=upcoming&status=confirmed&q=Acme&tableSize=25&tablePage=2";
    setup(origin);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir reserva" }));
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe(origin));
    expect(screen.getByTestId("list")).toHaveTextContent('"view":"upcoming"');
  });

  it("clears an incompatible status on transition and only offers valid upcoming states", async () => {
    setup("/bookings?status=cancelled&q=Acme", true);
    expect(await screen.findByTestId("status-tab-cancelled")).toBeInTheDocument();
    expect(screen.getByTestId("status-tab-completed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Próximas reservas" }));
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/bookings?q=Acme&view=upcoming"));
    expect(screen.queryByTestId("status-tab-cancelled")).toBeNull();
    expect(screen.queryByTestId("status-tab-completed")).toBeNull();
    expect(screen.getByTestId("status-tab-confirmed")).toBeInTheDocument();
    expect(screen.getByTestId("status-tab-all")).toBeInTheDocument();
    const upcomingRead = requests.find((calls) => calls.some((call) => call.method === "gte"));
    expect(upcomingRead).toBeDefined();
    expect(upcomingRead!.some((call) => call.method === "eq" && call.args[0] === "status" && call.args[1] === "cancelled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Todas las reservas" }));
    expect(await screen.findByTestId("status-tab-cancelled")).toBeInTheDocument();
    expect(screen.getByTestId("status-tab-completed")).toBeInTheDocument();
  });

  it.each(["cancelled", "completed"])("repairs an older upcoming bookmark with status=%s without sending a contradictory query", async (status) => {
    setup(`/bookings?view=upcoming&status=${status}&q=Acme&tablePage=3`);
    await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("/bookings?view=upcoming&q=Acme"));
    expect(screen.getByTestId("list")).toHaveTextContent('"status":"all"');
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.flat().some((call) => call.method === "eq" && call.args[0] === "status" && call.args[1] === status)).toBe(false);
  });

  it("keeps a requested page while data loads instead of clamping against visible rows", async () => {
    setup("/bookings?tablePage=30&tableSize=25");
    await waitFor(() => expect(screen.getByTestId("list")).toHaveTextContent('"raw":1'));
    expect(screen.getByTestId("url")).toHaveTextContent("tablePage=30");
    expect(requests[0]).toContainEqual({ method: "range", args: [750, 774] });
  });
});
