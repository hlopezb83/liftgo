import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "@/lib/router-compat";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { TestRouter } from "@/test/router";
import { TooltipProvider } from "@/components/ui/tooltip";
import CalendarPage from "../CalendarPage";

const fixture = vi.hoisted(() => ({
  loading: false,
  mobile: false,
  listeners: new Set<() => void>(),
  forklift: { id: "fl-1", name: "FL-01", model: "Demo", status: "available" },
  booking: { id: "bk-1", forklift_id: "fl-1", customer_name: "Cliente noviembre", status: "confirmed", start_date: "2026-11-01", end_date: "2026-11-30" },
}));

vi.mock("@/features/availability", () => ({ useServerTodayMty: () => "2026-10-18" }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => fixture.mobile }));
vi.mock("@/lib/utils", async (original) => ({
  ...await original<typeof import("@/lib/utils")>(),
  nowMty: () => new Date(2026, 9, 18, 12),
}));
vi.mock("@/features/bookings", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    BOOKINGS_RANGE_LIMIT: 2000,
    useBookingsRange: (from: string | Date) => {
      const pending = useSyncExternalStore(
        (listener) => { fixture.listeners.add(listener); return () => { fixture.listeners.delete(listener); }; },
        () => fixture.loading,
      );
      return { data: [fixture.booking], isLoading: typeof from !== "string" && pending, isError: false, isFetching: pending, refetch: vi.fn() };
    },
  };
});
vi.mock("@/features/fleet", () => ({
  useForkliftMap: () => ({ forklifts: [fixture.forklift], forkliftMap: new Map(), isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("../../hooks/useMaintenanceWindows", () => ({
  useMaintenanceWindows: () => ({ data: [], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("../../components/calendar/CalendarStatCards", () => ({ CalendarStatCards: () => null }));
vi.mock("../../components/calendar/EquipmentListView", () => ({ EquipmentListView: () => <div>Lista de equipos</div> }));
vi.mock("../../components/calendar/GanttChart", async () => {
  const { GanttRow } = await import("../../components/calendar/GanttRow");
  return { GanttChart: () => <GanttRow forklift={fixture.forklift as never} days={[new Date(2026, 10, 1)]} segments={[{
    booking: fixture.booking as never, label: "Cliente noviembre", durationDays: 30, color: "blue", leftPercent: 0, widthPercent: 100,
  }]} /> };
});

function Harness() {
  const location = useLocation();
  const navigate = useNavigateTransition();
  const state = location.state as { calendarReturnTo?: string } | null;
  return <>
    <output data-testid="url">{location.pathname}{location.search}</output>
    {location.pathname === "/calendar" ? <CalendarPage /> : <>
      <output data-testid="origin">{state?.calendarReturnTo ?? "sin origen"}</output>
      <button onClick={() => navigate(state?.calendarReturnTo ?? "/calendar")}>Regresar al calendario</button>
    </>}
  </>;
}

function renderCalendar(url = "/calendar") {
  return render(<TooltipProvider><TestRouter initialEntries={[url]}><Harness /></TestRouter></TooltipProvider>);
}

beforeEach(() => {
  fixture.loading = false;
  fixture.mobile = false;
  fixture.listeners.clear();
  window.sessionStorage.clear();
});

describe("Calendar navigation audit N5/N6", () => {
  it("reads date, view and range from the URL, including on a mobile viewport", async () => {
    fixture.mobile = true;
    renderCalendar("/calendar?date=2026-11-12&view=gantt&range=week");
    expect(await screen.findByRole("tab", { name: "Gantt" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Semana" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("button", { name: "Semana siguiente" })).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("date=2026-11-12");
  });

  it("opening a November Gantt booking carries the exact calendar origin and restores it on remount", async () => {
    renderCalendar();
    fireEvent.click(await screen.findByRole("button", { name: "Mes siguiente" }));
    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("date=2026-11-18"));
    fireEvent.click(screen.getByRole("button", { name: "Abrir reserva Cliente noviembre" }));
    expect(await screen.findByTestId("origin")).toHaveTextContent("/calendar?date=2026-11-18&view=gantt&range=month");
    fireEvent.click(screen.getByRole("button", { name: "Regresar al calendario" }));
    expect(await screen.findByRole("tab", { name: "Gantt" })).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("url")).toHaveTextContent("date=2026-11-18&view=gantt&range=month");
  });

  it("restores the last calendar date, view and range when reentering without a query", async () => {
    window.sessionStorage.setItem("list-filters:/calendar", "date=2026-11-12&view=gantt&range=week");
    fixture.mobile = true;
    renderCalendar();
    expect(await screen.findByRole("tab", { name: "Gantt" })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("date=2026-11-12&view=gantt&range=week"));
  });

  it.each(["gantt", "list"] as const)("keeps the %s next-period control mounted and focused throughout a range request", async (view) => {
    fixture.mobile = view === "list";
    renderCalendar(`/calendar?date=2026-10-18&view=${view}&range=month`);
    const next = await screen.findByRole("button", { name: "Mes siguiente" });
    act(() => next.focus());
    act(() => { fixture.loading = true; fixture.listeners.forEach((listener) => listener()); });
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByRole("button", { name: "Mes siguiente" })).toBe(next));
    expect(next).toHaveFocus();
    expect(screen.getByRole("status", { name: "Cargando calendario" })).toHaveTextContent("Cargando calendario");
    act(() => { fixture.loading = false; fixture.listeners.forEach((listener) => listener()); });
    await waitFor(() => expect(screen.queryByRole("status", { name: "Cargando calendario" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBe(next);
    expect(next).toHaveFocus();
  });
});
