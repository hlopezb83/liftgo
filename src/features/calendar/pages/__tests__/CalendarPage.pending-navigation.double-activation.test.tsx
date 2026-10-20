import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import BookingDetail from "@/features/bookings/pages/BookingDetail";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useLocation, useSearchParams } from "@/lib/router-compat";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";
import { GanttRow } from "../../components/calendar/GanttRow";
import CalendarPage from "../CalendarPage";

const fixture = vi.hoisted(() => ({ mobile: false }));
const booking = {
  id: "bk-november", booking_number: "RSV-0014", customer_name: "Cliente noviembre",
  forklift_id: "fl-1", status: "confirmed", start_date: "2026-11-16", end_date: "2026-11-17",
};
vi.mock("@/lib/utils", async (original) => ({
  ...await original<typeof import("@/lib/utils")>(), nowMty: () => new Date(2026, 9, 18, 12),
}));
vi.mock("@/features/bookings/hooks/bookings/useBookings", () => ({
  useBooking: () => ({ data: booking, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/features/deliveries", () => ({
  deliveryQueries: { list: () => ({ queryKey: ["deliveries-offline"], queryFn: async () => [] }) },
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false, useHasFinancialAccess: () => false }));
vi.mock("@/features/bookings/hooks/bookingActions/useBookingExtensions", () => ({ useBookingExtensions: () => ({ data: [] }) }));
vi.mock("@/features/bookings/components/bookings/BookingActions", () => ({ BookingActions: () => null }));
vi.mock("@/features/bookings/components/bookings/BookingStatusHistory", () => ({ BookingStatusHistory: () => null }));
vi.mock("@/features/bookings/components/booking-detail/BookingBillingCard", () => ({ BookingBillingCard: () => null }));
vi.mock("@/features/availability", () => ({ useServerTodayMty: () => "2026-10-18" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => fixture.mobile }));
vi.mock("@/features/bookings", () => ({
  BOOKINGS_RANGE_LIMIT: 2000,
  useBookingsRange: () => ({ data: [booking], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/features/fleet", () => ({
  useForkliftMap: () => ({ forklifts: [], forkliftMap: new Map(), isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("../../hooks/useMaintenanceWindows", () => ({
  useMaintenanceWindows: () => ({ data: [], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("../../components/calendar/CalendarStatCards", () => ({ CalendarStatCards: () => null }));
vi.mock("../../components/calendar/EquipmentListView", () => ({ EquipmentListView: () => null }));
vi.mock("../../components/calendar/GanttChart", () => ({
  GanttChart: () => <GanttRow forklift={{ id: "fl-1", name: "FL-01" } as never} days={[new Date(2026, 10, 16)]} segments={[{
    booking: booking as never, label: "Cliente noviembre", durationDays: 2, color: "blue", leftPercent: 0, widthPercent: 100,
  }]} />,
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="live-url">{location.pathname}{location.search}</output>;
}

function NavigationShell() {
  const navigate = useNavigateTransition();
  return <>
    <LocationProbe />
    <button onClick={() => navigate("/")}>Abrir Panel</button>
    <button onClick={() => navigate("/calendar")}>Reabrir calendario sin parámetros</button>
    <button onClick={() => navigate("/calendar?date=2026-12-18&view=list&range=month")}>Reabrir diciembre explícito</button>
    <Outlet />
  </>;
}

function QueuedCalendarQuery({ capture }: { capture: (writer: () => void) => void }) {
  const [, setParams] = useSearchParams();
  useEffect(() => {
    capture(() => setParams({ date: "2026-12-18" }, { replace: true, expectedPathname: "/calendar" }));
  }, [capture, setParams]);
  return null;
}

function mountPendingRouter(destination: "booking" | "panel") {
  let queuedWrite: (() => void) | undefined;
  const capture = (writer: () => void) => { queuedWrite = writer; };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pendingLoader = vi.fn(() => gate);
  const root = createRootRoute({ component: NavigationShell });
  const calendar = createRoute({ getParentRoute: () => root, path: "/calendar", component: () => <><QueuedCalendarQuery capture={capture} /><CalendarPage /></> });
  const detail = createRoute({ getParentRoute: () => root, path: "/bookings/$id", component: BookingDetail, loader: destination === "booking" ? pendingLoader : undefined });
  const bookings = createRoute({ getParentRoute: () => root, path: "/bookings", component: () => <h1>Reservas destino</h1> });
  const panel = createRoute({ getParentRoute: () => root, path: "/", component: () => <h1>Panel destino</h1>, loader: destination === "panel" ? pendingLoader : undefined });
  const router = createRouter({
    routeTree: root.addChildren([calendar, detail, bookings, panel]),
    history: createMemoryHistory({ initialEntries: ["/calendar?date=2026-10-18&view=gantt&range=month"] }),
    defaultPendingMs: 60_000, defaultPendingMinMs: 0, parseSearch, stringifySearch,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TooltipProvider><RouterProvider router={router} /></TooltipProvider></QueryClientProvider>);
  return { router, pendingLoader, release, runQueuedWrite: () => {
    if (!queuedWrite) throw new Error("Calendar query callback was not captured");
    queuedWrite();
  } };
}


beforeEach(() => {
  fixture.mobile = false;
  window.sessionStorage.clear();
});

describe("N5 repeated activation during a pending booking route", () => {
  it("keeps the November origin if the same outgoing Gantt event is activated twice", async () => {
    const { router, pendingLoader, release } = mountPendingRouter("booking");
    const sourceUrl = "/calendar?date=2026-11-18&view=gantt&range=month";
    const capture = (phase: string) => {
      const snapshot = { phase, url: router.state.location.href, origin: (router.state.location.state as { calendarReturnTo?: string }).calendarReturnTo };
      if (process.env.LIFTGO_AUDIT_SNAPSHOTS === "1") process.stdout.write(`N5_DOUBLE_ACTIVATION_SNAPSHOT ${JSON.stringify(snapshot)}\n`);
      return snapshot;
    };
    await screen.findByRole("heading", { name: "Calendario de Disponibilidad" });
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(router.state.location.href).toBe(sourceUrl));
    capture("source");
    try {
      fireEvent.click(screen.getByRole("button", { name: "Abrir reserva Cliente noviembre" }));
      await waitFor(() => expect(pendingLoader).toHaveBeenCalled());
      expect(capture("first-activation-pending")).toMatchObject({ url: "/bookings/bk-november", origin: sourceUrl });
      // The outgoing calendar remains visible and can receive a second click.
      fireEvent.click(screen.getByRole("button", { name: "Abrir reserva Cliente noviembre" }));
      await act(async () => {});
      expect.soft(capture("second-activation-pending")).toMatchObject({ url: "/bookings/bk-november", origin: sourceUrl });
    } finally {
      await act(async () => release());
    }
    await screen.findByRole("heading", { name: "RSV-0014" });
    capture("detail-settled");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await act(async () => {});
    expect(capture("returned")).toMatchObject({ url: sourceUrl });
  });
});
