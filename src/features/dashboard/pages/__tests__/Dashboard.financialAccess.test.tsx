import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";

const state = vi.hoisted(() => ({ loading: false, canSeeFinancials: false, priority: "overview" }));
vi.mock("@/features/invoices", () => ({ DemoTour: () => null }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("../../hooks/dashboard/useDashboardSections", () => ({ useDashboardSections: () => ({
  isLoading: state.loading,
  priority: state.priority,
  canSeeFinancials: state.canSeeFinancials,
  canViewFinancialCharts: state.canSeeFinancials,
  financials: {},
  alertsProps: {},
}) }));
vi.mock("@/components/layout/PageTransition", () => ({ PageTransition: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../components/dashboard/DashboardAlertsSection", () => ({ DashboardAlertsSection: () => null }));
vi.mock("../../components/dashboard/FinancialKpiCards", () => ({ FinancialKpiCards: () => <div>Financial KPIs</div> }));
vi.mock("../../components/dashboard/StatCards", () => ({ StatCards: () => <div>Operational KPIs</div> }));
vi.mock("../../components/dashboard/FleetStatusChart", () => ({ FleetStatusChart: () => <div>Fleet operation</div> }));
vi.mock("../../components/dashboard/UtilizationCharts", () => ({ UtilizationCharts: () => <div>Utilization operation</div> }));
vi.mock("../../components/dashboard/CashFlowChart", () => ({ CashFlowChart: () => <div>Facturación y cobros</div> }));

beforeEach(() => {
  state.loading = false;
  state.canSeeFinancials = false;
  state.priority = "overview";
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe("Dashboard financial wiring", () => {
  it.each(["finance", "operations"])("puts pending work first and preserves DOM reading order for %s", (priority) => {
    state.priority = priority;
    state.canSeeFinancials = true;
    const { container } = render(<Dashboard />);
    const sections = Array.from(container.querySelectorAll("section"));
    expect(sections[0]).toHaveAccessibleName(priority === "finance" ? "Pendientes de cobranza" : "Pendientes de despacho");
    expect(sections[1]).toHaveAccessibleName(priority === "finance" ? "Indicadores financieros" : "Indicadores de operación");
    expect(sections[2]).toHaveAccessibleName(priority === "finance" ? "Indicadores de operación" : "Indicadores financieros");
  });
  it("passes the financial restriction to charts and retains operational widgets", async () => {
    const { rerender } = render(<Dashboard />);
    expect(screen.getByText("Operational KPIs")).toBeInTheDocument();
    expect(await screen.findByText("Fleet operation")).toBeInTheDocument();
    expect(screen.queryByText("Facturación y cobros")).not.toBeInTheDocument();
    state.canSeeFinancials = true;
    rerender(<Dashboard />);
    expect(screen.getByText("Facturación y cobros")).toBeInTheDocument();
  });

  it("never advertises a financial section in the dispatcher loading skeleton", () => {
    state.loading = true;
    render(<Dashboard />);
    expect(screen.getByText("Operación")).toBeInTheDocument();
    expect(screen.queryByText("Finanzas")).not.toBeInTheDocument();
  });
});
