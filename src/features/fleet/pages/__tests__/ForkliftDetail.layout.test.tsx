import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForkliftDetail from "../ForkliftDetail";

const state = vi.hoisted(() => ({ costs: true, financials: true, financialAccess: true, notes: "Notas del equipo" }));
vi.mock("@/lib/router-compat", () => ({ useParams: () => ({ id: "equipment-demo" }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("@/features/availability", () => ({ useServerTodayMty: () => "2026-10-18" }));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: [] }) }));
vi.mock("@/features/maintenance", () => ({ useMaintenanceLogs: () => ({ data: [] }) }));
vi.mock("@/features/damage", () => ({ DamagePhotosSection: () => null }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: () => null }));
vi.mock("@/components/layout/DetailPageHeader", () => ({ DetailPageHeader: () => <h1>Equipo demo</h1> }));
vi.mock("@/components/domain/NotesCard", () => ({ NotesCard: ({ value }: { value: string }) => <section aria-label="Notas">{value}</section> }));
vi.mock("../../hooks/useCanSeeFinancialCosts", () => ({ useCanSeeFinancialCosts: () => state.costs }));
vi.mock("../../hooks/forklifts/useForklifts", () => ({
  useForklift: () => ({ data: { id: "equipment-demo", name: "Equipo demo", model: "FD50", manufacturer: "LIFT GO",
    status: "available", notes: state.notes, daily_rate: 500, weekly_rate: 3000, monthly_rate: 15000, acquisition_cost: 250000 } }),
  useStatusLogs: () => ({ data: [] }), useDeleteForklift: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../hooks/forklifts/useForkliftLocation", () => ({ useForkliftLocation: () => ({ data: null }) }));
vi.mock("../../hooks/forklifts/useForkliftFinancials", () => ({ useForkliftFinancials: () => ({ data: state.financials ? {
  revenue: 55000, maintenance_cost: 1000, gross_margin: 54000, roi_percent: 21.6,
  days_rented: 105, utilization_percent: 50, hourometer_history: [],
} : undefined, isLoading: false, canViewFinancials: state.financialAccess }) }));
vi.mock("../../components/forklift-detail/DocumentAttachments", () => ({ DocumentAttachments: () => null }));
vi.mock("../../components/forklift-detail/ForkliftBookingsList", () => ({ ForkliftBookingsList: () => null }));
vi.mock("../../components/forklift-detail/ForkliftMaintenanceList", () => ({ ForkliftMaintenanceList: () => null }));
vi.mock("../../components/forklift-detail/ForkliftHourometerHistory", () => ({ ForkliftHourometerHistory: () => <section aria-label="Historial de horómetro" /> }));
vi.mock("../../components/forklift-detail/ForkliftStatusHistory", () => ({ ForkliftStatusHistory: () => null }));

beforeEach(() => { state.costs = true; state.financials = true; state.financialAccess = true; state.notes = "Notas del equipo"; });
afterEach(cleanup);

describe("ubicación del resumen financiero (componentes de tarjetas reales)", () => {
  it("oculta resumen e historial al perder autorización aunque reciba datos cacheados", () => {
    const { rerender } = render(<ForkliftDetail />);
    expect(screen.getByText("Resumen Financiero")).toBeInTheDocument();
    expect(screen.getByLabelText("Historial de horómetro")).toBeInTheDocument();

    state.financialAccess = false;
    rerender(<ForkliftDetail />);

    expect(screen.queryByText("Resumen Financiero")).not.toBeInTheDocument();
    expect(screen.queryByText("$55,000.00")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Historial de horómetro")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toHaveTextContent("Notas del equipo");
  });

  it("resumen después de Specs/Tarifas y antes de Notas, fuera del grid", () => {
    render(<ForkliftDetail />);
    const specs = screen.getByText("Especificaciones");
    const rates = screen.getByText("Tarifas de Renta");
    const financial = screen.getByText("Resumen Financiero");
    const notes = screen.getByLabelText("Notas");
    expect(specs.compareDocumentPosition(financial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rates.compareDocumentPosition(financial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(financial.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const grid = specs.closest(".grid");
    expect(grid).toHaveClass("items-start");
    expect(grid?.contains(financial)).toBe(false);
    expect(screen.getByText("$55,000.00")).toBeInTheDocument();
    expect(screen.getByText("21.6%")).toBeInTheDocument();
    expect(screen.getByText("105")).toBeInTheDocument();
  });

  it("un rol sin costos conserva resumen autorizado por el gate independiente", () => {
    state.costs = false;
    render(<ForkliftDetail />);
    expect(screen.queryByText("Tarifas de Renta")).not.toBeInTheDocument();
    expect(screen.queryByText("Costo de Adquisición")).not.toBeInTheDocument();
    expect(screen.getByText("Resumen Financiero")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toHaveTextContent("Notas del equipo");
  });

  it("sin resultados financieros no añade resumen ni modifica notas", () => {
    state.financials = false;
    render(<ForkliftDetail />);
    expect(screen.queryByText("Resumen Financiero")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toHaveTextContent("Notas del equipo");
  });

  it("sin notas conserva el resumen", () => {
    state.notes = "";
    render(<ForkliftDetail />);
    expect(screen.queryByLabelText("Notas")).not.toBeInTheDocument();
    expect(screen.getByText("Resumen Financiero")).toBeInTheDocument();
  });
});
