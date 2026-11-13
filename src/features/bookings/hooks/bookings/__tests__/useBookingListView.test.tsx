import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailPageHeader } from "@/components/layout/DetailPageHeader";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useLocation } from "@/lib/router-compat";
import { LIST_FETCH_LIMIT, LIST_PAGE_LIMIT } from "@/lib/supabase/constants";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { TestRouter } from "@/test/router";
import { upcomingBookingsQuery, useBookingListView } from "../useBookingListView";
import BookingsPage from "../../../pages/BookingsPage";

let requests: ChainCall[][] = [];
let rows: { id: string; customer_name: string; booking_number: string; status: string; start_date?: string; end_date?: string }[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ tableResolvers: {
    bookings: (calls) => { requests.push(calls); return { data: rows, error: null }; },
  } }),
}));
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
    <output data-testid="list">{JSON.stringify({ values: list.values, visible: list.filtered.length, raw: list.query.data?.length })}</output>
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
    await client.fetchQuery(upcomingBookingsQuery({ q: " Acme,()%_ ", status: "confirmed" }));
    const calls = requests[0];
    const operations = calls.map((call) => [call.method, ...call.args]);
    expect(operations).toEqual(expect.arrayContaining([
      ["or", "is_e2e.is.null,is_e2e.eq.false"], ["in", "status", ["confirmed"]],
      ["gte", "start_date", "2026-11-11"], ["eq", "status", "confirmed"],
      ["or", "customer_name.ilike.%Acme%,booking_number.ilike.%Acme%"],
      ["order", "start_date", { ascending: true }], ["order", "id", { ascending: true }],
    ]));
    expect(operations.at(-1)).toEqual(["limit", LIST_FETCH_LIMIT]);
    expect(requests).toHaveLength(1);
    client.clear();
  });

  it("keeps today and the view in cache identity", () => {
    const filter = { q: "", status: "all" };
    expect(upcomingBookingsQuery(filter, "2026-11-11").queryKey).not.toEqual(upcomingBookingsQuery(filter, "2026-11-12").queryKey);
  });

  it("Todos keeps its original read and filters locally", async () => {
    setup("/bookings?q=otra&status=confirmed");
    await waitFor(() => expect(screen.getByTestId("list")).toHaveTextContent('"raw":1'));
    expect(screen.getByTestId("list")).toHaveTextContent('"visible":0');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContainEqual({ method: "order", args: ["start_date", { ascending: false }] });
    expect(requests[0].some((call) => ["in", "gte", "eq"].includes(call.method))).toBe(false);
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

  it("keeps the sentinel row for the truncation notice while rendering at most 500", async () => {
    rows = Array.from({ length: LIST_FETCH_LIMIT }, (_, i) => ({ id: `qa-${i}`, booking_number: `RES-${i}`, customer_name: "Acme", status: "confirmed" }));
    setup("/bookings?view=upcoming");
    await waitFor(() => expect(screen.getByTestId("list")).toHaveTextContent(`"raw":${LIST_FETCH_LIMIT}`));
    expect(screen.getByTestId("list")).toHaveTextContent(`"visible":${LIST_PAGE_LIMIT}`);
  });
});
