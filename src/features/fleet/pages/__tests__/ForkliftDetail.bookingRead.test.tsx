import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach,  expect, it, vi } from "vitest";
import ForkliftDetail from "../ForkliftDetail";

const state = vi.hoisted(() => ({ bookings: undefined as undefined | Record<string, unknown>[], retryBookings: vi.fn(), bookingPending: false, bookingError: false, bookingFetching: false, status: "available", costs: true, financials: true, financialAccess: true, notes: "Notas del equipo", logsLoading: false, logsError: false, logsFetching: false, retryLogs: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: "equipment-demo" }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/features/availability", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/availability")>(),
  useServerTodayMty: () => "2026-10-18",
}));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: state.bookings, isPending: state.bookingPending, isError: state.bookingError, isFetching: state.bookingFetching, refetch: state.retryBookings }) }));
vi.mock("@/features/maintenance", () => ({ useMaintenanceLogs: () => ({ data: [] }) }));
vi.mock("@/features/damage", () => ({ DamagePhotosSection: () => null }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("@/components/layout/DetailPageHeader", () => ({ DetailPageHeader: ({ badges }: { badges: React.ReactNode }) => <header>{badges}</header> }));
vi.mock("@/components/domain/NotesCard", () => ({ NotesCard: ({ value }: { value: string }) => <section aria-label="Notas">{value}</section> }));
vi.mock("../../hooks/useCanSeeFinancialCosts", () => ({ useCanSeeFinancialCosts: () => state.costs }));
vi.mock("../../hooks/forklifts/useForklifts", () => ({
  useForklift: () => ({ data: { id: "equipment-demo", name: "Equipo demo", model: "FD50", manufacturer: "LIFT GO",
    status: state.status, notes: state.notes, daily_rate: 500, weekly_rate: 3000, monthly_rate: 15000, acquisition_cost: 250000 } }),
  useStatusLogs: () => ({ data: [], isLoading: state.logsLoading, isError: state.logsError, isFetching: state.logsFetching, refetch: state.retryLogs }), useDeleteForklift: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../hooks/forklifts/useForkliftLocation", () => ({ useForkliftLocation: () => ({ data: null }) }));
vi.mock("../../hooks/forklifts/useForkliftFinancials", () => ({ useForkliftFinancials: () => ({ data: state.financials ? {
  revenue: 55000, maintenance_cost: 1000, gross_margin: 54000, roi_percent: 21.6,
  days_rented: 105, utilization_percent: 50, hourometer_history: [],
} : undefined, isLoading: false, canViewFinancials: state.financialAccess }) }));
vi.mock("../../components/forklift-detail/DocumentAttachments", () => ({ DocumentAttachments: () => null }));
vi.mock("../../components/forklift-detail/ForkliftMaintenanceList", () => ({ ForkliftMaintenanceList: () => null }));
vi.mock("../../components/forklift-detail/ForkliftHourometerHistory", () => ({ ForkliftHourometerHistory: () => <section aria-label="Historial de horómetro" /> }));


afterEach(cleanup);
const reservation = { id: "fixture-reservation", forklift_id: "equipment-demo", customer_name: "QA fixture customer", start_date: "2026-10-01", end_date: "2026-10-30", status: "confirmed" };
it.each([
  ["pending, no cache", undefined, true, false, true, "available", "Disponibilidad sin verificar", false],
  ["error, no cache", undefined, false, true, false, "available", "Disponibilidad sin verificar", false],
  ["success empty", [], false, false, false, "available", "Disponible", true],
  ["confirmed booking", [reservation], false, false, false, "available", "Rentado", false],
  ["refetch error with confirmed cache", [reservation], false, true, false, "available", "Disponibilidad sin verificar", false],
  ["refetch error with empty cache", [], false, true, false, "available", "Disponibilidad sin verificar", false],
  ["maintenance with confirmed booking", [reservation], false, false, false, "maintenance", "Mantenimiento", false],
  ["maintenance with booking error", undefined, false, true, false, "maintenance", "Mantenimiento", false],
  ["refreshing cached empty", [], false, false, true, "available", "Disponibilidad sin verificar", false],
  ["refreshing confirmed cache", [reservation], false, false, true, "available", "Disponibilidad sin verificar", false],
])("handles %s", (_name, data, pending, error, fetching, status, badge, empty) => {
  state.bookings = data as typeof state.bookings; state.bookingPending = Boolean(pending); state.bookingError = Boolean(error); state.bookingFetching = Boolean(fetching); state.status = String(status);
  const { container } = render(<ForkliftDetail />);
  expect(container.querySelector("header")).toHaveTextContent(String(badge));
  expect(Boolean(screen.queryByText("Sin reservas aún"))).toBe(empty);
  if (error) expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron actualizar las reservas");
  if (data?.length) expect(screen.getByText("QA fixture customer")).toBeInTheDocument();
});
it("retries only bookings, preserves detail, disables pending retry and recovers to successful empty", () => {
  state.bookings = []; state.bookingPending = false; state.bookingError = true; state.bookingFetching = false; state.status = "available";
  const { rerender, container } = render(<ForkliftDetail />);
  expect(screen.getByText("Los datos guardados pueden estar desactualizados.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar reservas" }));
  expect(state.retryBookings).toHaveBeenCalledTimes(1);
  expect(state.retryLogs).not.toHaveBeenCalled();
  state.bookingFetching = true; rerender(<ForkliftDetail />);
  expect(screen.getByRole("button", { name: "Reintentar reservas" })).toBeDisabled();
  expect(screen.getByText("Especificaciones")).toBeInTheDocument();
  state.bookingError = false; state.bookingFetching = false; rerender(<ForkliftDetail />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("Sin reservas aún")).toBeInTheDocument();
  expect(container.querySelector("header")).toHaveTextContent("Disponible");
});
