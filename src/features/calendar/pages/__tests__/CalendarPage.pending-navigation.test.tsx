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
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
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

function captureVisualState(phase: string, mobile: boolean) {
  const selectedTabs = screen.queryAllByRole("tab").filter((node) => node.getAttribute("aria-selected") === "true").map((node) => node.textContent);
  const calendarPeriod = screen.queryByText(/^(?:Octubre|Noviembre|Diciembre) de 2026$/)?.textContent ?? null;
  const listPrevious = selectedTabs.includes("Lista") ? screen.queryByRole("button", { name: /^(?:Mes|Semana) anterior$/ }) : null;
  const calendarRange = listPrevious?.parentElement?.querySelector("span")?.textContent ?? calendarPeriod;
  const snapshot = {
    phase,
    viewport: mobile ? "mobile" : "desktop",
    url: screen.getByTestId("live-url").textContent,
    headings: screen.queryAllByRole("heading", { level: 1 }).map((node) => node.textContent),
    calendarPeriod,
    calendarRange,
    selectedTabs,
    calendarLoading: screen.queryByRole("status", { name: "Cargando calendario" }) !== null,
    savedCalendar: window.sessionStorage.getItem("list-filters:/calendar"),
  };
  if (process.env.LIFTGO_AUDIT_SNAPSHOTS === "1") process.stdout.write(`N5_VISUAL_SNAPSHOT ${JSON.stringify(snapshot)}\n`);
  return snapshot;
}

beforeEach(() => {
  fixture.mobile = false;
  window.sessionStorage.clear();
});

describe("N5 real sibling-route pending navigation", () => {
  it.each([false, true])("keeps the November booking origin while its route loads (mobile=%s)", async (mobile) => {
    fixture.mobile = mobile;
    window.sessionStorage.setItem("list-filters:/bookings", "status=completed");
    const { router, pendingLoader, release, runQueuedWrite } = mountPendingRouter("booking");
    await screen.findByRole("heading", { name: "Calendario de Disponibilidad" });
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(screen.getByTestId("live-url")).toHaveTextContent("date=2026-11-18&view=gantt&range=month"));
    expect(captureVisualState("booking-source", mobile)).toMatchObject({ calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Abrir reserva Cliente noviembre" }));
      await waitFor(() => expect(pendingLoader).toHaveBeenCalled());
      // The old calendar remains mounted during the destination loader.
      expect(screen.getByRole("heading", { name: "Calendario de Disponibilidad" })).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.pathname).toBe("/bookings/bk-november"));
      expect.soft(router.state.location.searchStr).toBe("");
      expect.soft(router.state.location.state).toMatchObject({ calendarReturnTo: "/calendar?date=2026-11-18&view=gantt&range=month" });
      expect.soft(captureVisualState("booking-pending", mobile)).toMatchObject({
        calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"], calendarLoading: false,
      });
      const destinationHref = router.state.location.href;
      const destinationState = router.state.location.state;
      // A callback queued before navigation must also check the live pathname;
      // this calls the actual setter directly, independently of the hook guard.
      act(() => runQueuedWrite());
      expect.soft(router.state.location.href).toBe(destinationHref);
      expect.soft(router.state.location.state).toEqual(destinationState);
    } finally {
      await act(async () => release());
    }
    await screen.findByRole("heading", { name: "RSV-0014" });
    expect(captureVisualState("booking-settled", mobile)).toMatchObject({ headings: ["RSV-0014"], calendarPeriod: null });
    expect.soft(router.state.location.searchStr).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("live-url")).toHaveTextContent("/calendar?date=2026-11-18&view=gantt&range=month"));
    expect(screen.getByRole("tab", { name: "Gantt" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Mes" })).toHaveAttribute("data-state", "active");
    expect(captureVisualState("calendar-returned", mobile)).toMatchObject({ calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"] });
  });

  it.each([false, true])("retains outgoing calendar content without writing to the pending Panel route (mobile=%s)", async (mobile) => {
    fixture.mobile = mobile;
    const { router, pendingLoader, release } = mountPendingRouter("panel");
    await screen.findByRole("heading", { name: "Calendario de Disponibilidad" });
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(screen.getByTestId("live-url")).toHaveTextContent("date=2026-11-18"));
    expect(captureVisualState("panel-source", mobile)).toMatchObject({ calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Abrir Panel" }));
      await waitFor(() => expect(pendingLoader).toHaveBeenCalled());
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect.soft(router.state.location.searchStr).toBe("");
      expect.soft(captureVisualState("panel-pending", mobile)).toMatchObject({
        calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"], calendarLoading: false,
      });
    } finally {
      await act(async () => release());
    }
    await screen.findByRole("heading", { name: "Panel destino" });
    expect(router.state.location.href).toBe("/");
    expect(captureVisualState("panel-settled", mobile)).toMatchObject({ headings: ["Panel destino"], calendarPeriod: null });
  });

  it.each([false, true])("retains November when a pending detail is cancelled by bare calendar navigation (mobile=%s)", async (mobile) => {
    fixture.mobile = mobile;
    const { router, pendingLoader, release } = mountPendingRouter("booking");
    const outgoingHeading = await screen.findByRole("heading", { name: "Calendario de Disponibilidad" });
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(router.state.location.searchStr).toContain("date=2026-11-18"));
    captureVisualState("cancel-source", mobile);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Abrir reserva Cliente noviembre" }));
      await waitFor(() => expect(pendingLoader).toHaveBeenCalled());
      captureVisualState("cancel-pending", mobile);
      fireEvent.click(screen.getByRole("button", { name: "Reabrir calendario sin parámetros" }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/calendar"));
      await act(async () => {});
      expect.soft(captureVisualState("cancel-returned-bare", mobile)).toMatchObject({ calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"] });
      expect.soft(screen.getByRole("heading", { name: "Calendario de Disponibilidad" })).toBe(outgoingHeading);
      expect.soft(router.state.location.href).toBe("/calendar?date=2026-11-18&view=gantt&range=month");
    } finally {
      await act(async () => release());
    }
    expect(captureVisualState("cancel-settled", mobile)).toMatchObject({ calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"] });
  });

  it.each([false, true])("an explicit new calendar URL overrides the retained pending snapshot (mobile=%s)", async (mobile) => {
    fixture.mobile = mobile;
    const { router, pendingLoader, release } = mountPendingRouter("booking");
    await screen.findByRole("heading", { name: "Calendario de Disponibilidad" });
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(router.state.location.searchStr).toContain("date=2026-11-18"));
    captureVisualState("explicit-source", mobile);
    try {
      fireEvent.click(screen.getByRole("button", { name: "Abrir reserva Cliente noviembre" }));
      await waitFor(() => expect(pendingLoader).toHaveBeenCalled());
      expect.soft(captureVisualState("explicit-pending", mobile)).toMatchObject({ calendarPeriod: "Noviembre de 2026", selectedTabs: ["Gantt", "Mes"] });
      fireEvent.click(screen.getByRole("button", { name: "Reabrir diciembre explícito" }));
      await waitFor(() => expect(router.state.location.href).toBe("/calendar?date=2026-12-18&view=list&range=month"));
      expect(captureVisualState("explicit-returned", mobile)).toMatchObject({ calendarPeriod: "Diciembre de 2026", selectedTabs: ["Lista", "Mes"] });
    } finally {
      await act(async () => release());
    }
    expect(captureVisualState("explicit-settled", mobile)).toMatchObject({ calendarPeriod: "Diciembre de 2026", selectedTabs: ["Lista", "Mes"] });
  });

  it.each([false, true])("retains List/Week content while a sibling Panel is pending (mobile=%s)", async (mobile) => {
    fixture.mobile = mobile;
    const { router, pendingLoader, release } = mountPendingRouter("panel");
    await screen.findByRole("heading", { name: "Calendario de Disponibilidad" });
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(router.state.location.searchStr).toContain("date=2026-11-18"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Lista" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(router.state.location.searchStr).toContain("view=list"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Semana" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(router.state.location.searchStr).toContain("range=week"));
    const source = captureVisualState("week-source", mobile);
    expect(source).toMatchObject({ calendarRange: expect.stringContaining("/2026"), selectedTabs: ["Lista", "Semana"] });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Abrir Panel" }));
      await waitFor(() => expect(pendingLoader).toHaveBeenCalled());
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect.soft(captureVisualState("week-pending", mobile)).toMatchObject({
        calendarRange: source.calendarRange, selectedTabs: source.selectedTabs, calendarLoading: false,
      });
      expect(router.state.location.searchStr).toBe("");
    } finally {
      await act(async () => release());
    }
    expect(captureVisualState("week-settled", mobile)).toMatchObject({ headings: ["Panel destino"], calendarPeriod: null });
  });
});
