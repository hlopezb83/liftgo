import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";

const state = vi.hoisted(() => ({ loading: false, canSeeFinancials: false }));
vi.mock("@/features/invoices", () => ({ DemoTour: () => null }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
vi.mock("../../hooks/dashboard/useDashboardSections", () => ({ useDashboardSections: () => ({
  isLoading: state.loading,
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

beforeEach(() => { state.loading = false; state.canSeeFinancials = false; });

describe("Dashboard financial wiring", () => {
  it("passes the financial restriction to charts and retains operational widgets", () => {
    const { rerender } = render(<Dashboard />);
    expect(screen.getByText("Operational KPIs")).toBeInTheDocument();
    expect(screen.getByText("Fleet operation")).toBeInTheDocument();
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
