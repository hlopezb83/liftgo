import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardChartsSection } from "../DashboardChartsSection";

vi.mock("../FleetStatusChart", () => ({ FleetStatusChart: () => <div>Fleet operation</div> }));
vi.mock("../UtilizationCharts", () => ({ UtilizationCharts: () => <div>Utilization operation</div> }));
vi.mock("../CashFlowChart", () => ({ CashFlowChart: () => <div>Facturación y cobros</div> }));
const data = { pieData: [], monthlyUtilization: [], revenuePerUnit: [], cashFlowData: [] };

beforeEach(() => vi.stubGlobal("IntersectionObserver", undefined));
afterEach(() => vi.unstubAllGlobals());

describe("Dashboard chart financial boundary", () => {
  it("does not mount the financial chart for dispatcher, preserving operation", async () => {
    render(<DashboardChartsSection {...data} canSeeFinancials={false} />);
    expect(await screen.findByText("Fleet operation")).toBeInTheDocument();
    expect(screen.getByText("Utilization operation")).toBeInTheDocument();
    expect(screen.queryByText("Facturación y cobros")).not.toBeInTheDocument();
  });
  it("retains the chart for authorized roles and removes it immediately on role change", async () => {
    const { rerender } = render(<DashboardChartsSection {...data} canSeeFinancials />);
    expect(await screen.findByText("Facturación y cobros")).toBeInTheDocument();
    rerender(<DashboardChartsSection {...data} canSeeFinancials={false} />);
    expect(screen.queryByText("Facturación y cobros")).not.toBeInTheDocument();
  });

  it("waits until the chart area approaches the viewport", async () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof notify) { notify = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    render(<DashboardChartsSection {...data} canSeeFinancials />);
    expect(observe).toHaveBeenCalledOnce();
    act(() => notify([{ isIntersecting: false }]));
    expect(screen.queryByText("Fleet operation")).not.toBeInTheDocument();
    act(() => notify([{ isIntersecting: true }]));
    expect(await screen.findByText("Fleet operation")).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });
});
