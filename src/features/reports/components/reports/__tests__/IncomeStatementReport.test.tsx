import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeStatementReport } from "../IncomeStatementReport";

const reportData = vi.hoisted(() => ({ isComparison: false }));

vi.mock("../../../hooks/useIncomeStatementData", () => ({
  useIncomeStatementData: () => ({
    totals: {
      revenue: 150000,
      totalExpenses: 45000,
      depreciationRented: 8000,
      depreciationIdle: 2000,
      netProfit: 95000,
      margin: 63.3,
    },
    filteredData: [], statementRows: [], comparisonRows: [], yearTotals: [],
    csvRows: [], depreciationBreakdownRows: [], cogsBreakdownRows: [],
    rentalBookedBreakdownRows: [], rentalUnbookedBreakdownRows: [],
    salesBreakdownRows: [], otherServicesBreakdownRows: [],
    damageRecoveryBreakdownRows: [], creditNotesBreakdownRows: [],
    expenseDetailBreakdownByCategory: {}, rentedWithoutCost: [], soldWithoutCost: [],
    fxMissingCount: 0, availableYears: [2026], selectedYear: "2026",
    setSelectedYear: vi.fn(), isComparison: reportData.isComparison,
    isError: false, isFetching: false, refetch: vi.fn(),
  }),
}));

// Las secciones ajenas al KPI no son el objeto de esta prueba aislada.
vi.mock("../IncomeStatementToolbar", () => ({ IncomeStatementToolbar: () => null }));
vi.mock("../IncomeStatementTable", () => ({ IncomeStatementTable: () => null }));

const expectedKpis = [
  ["Ingresos", "$150,000.00"],
  ["Egresos antes de depreciación", "$45,000.00"],
  ["Depreciación total", "$10,000.00"],
  ["Utilidad Neta", "$95,000.00"],
  ["Margen Neto", "63.3%"],
];

function renderReport() {
  return render(<IncomeStatementReport startDate={new Date(2026, 0, 1)} endDate={new Date(2026, 0, 31)} />);
}

beforeEach(() => { reportData.isComparison = false; });

describe("IncomeStatementReport · KPI completos", () => {
  it("conserva los cinco importes exactos del reporte", () => {
    renderReport();
    for (const [label, value] of expectedKpis) {
      const labelElement = screen.getByText(label);
      expect(labelElement.getAttribute("title")).toBe(label);
      expect(screen.getByText(value).getAttribute("title")).toBe(value);
    }
  });

  it("el comparativo sigue sin mostrar KPI", () => {
    reportData.isComparison = true;
    renderReport();
    for (const [label, value] of expectedKpis) {
      expect(screen.queryByText(label)).toBeNull();
      expect(screen.queryByText(value)).toBeNull();
    }
  });
});