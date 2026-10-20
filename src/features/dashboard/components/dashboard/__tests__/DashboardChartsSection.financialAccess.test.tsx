import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardChartsSection } from "../DashboardChartsSection";

vi.mock("../FleetStatusChart", () => ({ FleetStatusChart: () => <div>Fleet operation</div> }));
vi.mock("../UtilizationCharts", () => ({ UtilizationCharts: () => <div>Utilization operation</div> }));
vi.mock("../CashFlowChart", () => ({ CashFlowChart: () => <div>Facturación y cobros</div> }));
const data = { pieData: [], monthlyUtilization: [], revenuePerUnit: [], cashFlowData: [] };

describe("Dashboard chart financial boundary", () => {
  it("does not mount the financial chart for dispatcher, preserving operation", () => {
    render(<DashboardChartsSection {...data} canSeeFinancials={false} />);
    expect(screen.getByText("Fleet operation")).toBeInTheDocument();
    expect(screen.getByText("Utilization operation")).toBeInTheDocument();
    expect(screen.queryByText("Facturación y cobros")).not.toBeInTheDocument();
  });
  it("retains the chart for authorized roles and removes it immediately on role change", () => {
    const { rerender } = render(<DashboardChartsSection {...data} canSeeFinancials />);
    expect(screen.getByText("Facturación y cobros")).toBeInTheDocument();
    rerender(<DashboardChartsSection {...data} canSeeFinancials={false} />);
    expect(screen.queryByText("Facturación y cobros")).not.toBeInTheDocument();
  });
});
