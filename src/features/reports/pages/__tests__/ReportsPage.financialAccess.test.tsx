import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPage from "../ReportsPage";

const state = vi.hoisted(() => ({ canSeeFinancials: false, params: new URLSearchParams(), financialMount: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasFinancialAccess: () => state.canSeeFinancials }));
vi.mock("@/lib/router-compat", () => ({
  useSearchParams: () => [state.params, (update: (previous: URLSearchParams) => URLSearchParams) => { state.params = update(state.params); }],
}));
vi.mock("@/components/layout/PageTransition", () => ({ PageTransition: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/forms/DateRangePickerField", () => ({ DateRangePickerField: ({ dateRange, onSelect }: { dateRange: { from?: Date; to?: Date }; onSelect: (range: { from: Date; to?: Date }) => void }) => <div>
    <output data-testid="range">{dateRange.from?.toISOString().slice(0, 10)} / {dateRange.to?.toISOString().slice(0, 10)}</output>
    <button onClick={() => onSelect({ from: new Date(2026, 0, 1), to: new Date(2026, 1, 28) })}>Select QA range</button>
  </div> }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (value: string) => void }) => <select aria-label="Tipo de reporte" value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
vi.mock("../../components/accountantExport/AccountantExportReport", () => ({ AccountantExportReport: () => { state.financialMount("accountant-export"); return <div>Financial accountant export</div>; } }));
vi.mock("../../components/reports/UtilizationReport", () => ({ UtilizationReport: () => <div>Operational units</div> }));
vi.mock("../../components/reports/UtilizationByModelReport", () => ({ UtilizationByModelReport: () => <div>Operational models</div> }));
vi.mock("../../components/reports/RevenueReport", () => ({ RevenueReport: () => { state.financialMount("revenue"); return <div>Financial revenue</div>; } }));
vi.mock("../../components/reports/AgingReport", () => ({ AgingReport: () => { state.financialMount("aging"); return <div>Financial aging</div>; } }));
vi.mock("../../components/reports/IncomeStatementReport", () => ({ IncomeStatementReport: () => { state.financialMount("income-statement"); return <div>Financial income</div>; } }));
vi.mock("../../components/reports/MaintenanceCostReport", () => ({ MaintenanceCostReport: () => { state.financialMount("maintenance"); return <div>Financial maintenance</div>; } }));
vi.mock("../../components/reports/ProfitabilityByModelReport", () => ({ ProfitabilityByModelReport: () => { state.financialMount("profitability"); return <div>Financial profit</div>; } }));

beforeEach(() => { state.canSeeFinancials = false; state.params = new URLSearchParams(); state.financialMount.mockClear(); });

describe("Reports dispatcher financial boundary", () => {
  it("keeps operational reports and removes all financial choices", () => {
    const { rerender } = render(<ReportsPage />);
    expect(screen.getByText("Operational units")).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["utilization", "utilization-model"]);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "utilization-model" } });
    rerender(<ReportsPage />);
    expect(screen.getByText("Operational models")).toBeInTheDocument();
    expect(state.financialMount).not.toHaveBeenCalled();
  });

  it.each(["revenue", "maintenance", "profitability", "income-statement", "aging", "accountant-export"])("blocks direct ?type=%s without mounting its data component", (type) => {
    state.params = new URLSearchParams({ type });
    render(<ReportsPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso");
    expect(state.financialMount).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Financial /)).not.toBeInTheDocument();
  });

  it("rechecks authorization when the active role changes on the same report", () => {
    state.canSeeFinancials = true;
    state.params = new URLSearchParams({ type: "revenue" });
    const { rerender } = render(<ReportsPage />);
    expect(screen.getByText("Financial revenue")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(8);
    state.canSeeFinancials = false;
    state.financialMount.mockClear();
    rerender(<ReportsPage />);
    expect(screen.queryByText("Financial revenue")).not.toBeInTheDocument();
    expect(state.financialMount).not.toHaveBeenCalled();
  });

  it("rechecks direct navigation while already mounted, and preserves allowed financial roles", () => {
    const { rerender } = render(<ReportsPage />);
    state.params = new URLSearchParams({ type: "aging" });
    rerender(<ReportsPage />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(state.financialMount).not.toHaveBeenCalled();
    state.canSeeFinancials = true;
    rerender(<ReportsPage />);
    expect(screen.getByText("Financial aging")).toBeInTheDocument();
  });
});


describe("report period URL continuity", () => {
  it("restores a valid period and writes changes alongside report type", () => {
    state.canSeeFinancials = true;
    state.params = new URLSearchParams({ type: "revenue", from: "2026-03-01", to: "2026-03-31" });
    const view = render(<ReportsPage />);
    expect(screen.getByTestId("range")).toHaveTextContent("2026-03-01 / 2026-03-31");
    fireEvent.click(screen.getByText("Select QA range"));
    expect(Object.fromEntries(state.params)).toMatchObject({ type: "revenue", from: "2026-01-01", to: "2026-02-28" });
    view.unmount();
    render(<ReportsPage />);
    expect(screen.getByTestId("range")).toHaveTextContent("2026-01-01 / 2026-02-28");
  });
  it.each([["2026-02-31", "2026-03-01"], ["2026-04-10", "2026-04-01"]])("rejects malformed or reversed date ranges", (from, to) => {
    state.params = new URLSearchParams({ from, to });
    render(<ReportsPage />);
    expect(screen.getByTestId("range")).not.toHaveTextContent(`${from} / ${to}`);
  });
});
