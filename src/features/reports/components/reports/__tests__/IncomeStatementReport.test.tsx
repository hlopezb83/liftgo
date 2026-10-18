import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeStatementReport } from "../IncomeStatementReport";

const reportData = vi.hoisted(() => ({
  isComparison: false,
  margin: 63.3 as number | null,
  rentedWithoutCost: [] as { id: string; name: string }[],
  soldWithoutCost: [] as { id: string; name: string }[],
}));

vi.mock("../../../hooks/useIncomeStatementData", () => ({
  useIncomeStatementData: () => ({
    totals: {
      revenue: 150000,
      totalExpenses: 45000,
      depreciationRented: 8000,
      depreciationIdle: 2000,
      netProfit: 95000,
      margin: reportData.margin,
    },
    filteredData: [], statementRows: [], comparisonRows: [], yearTotals: [],
    csvRows: [], depreciationBreakdownRows: [], cogsBreakdownRows: [],
    rentalBookedBreakdownRows: [], rentalUnbookedBreakdownRows: [],
    salesBreakdownRows: [], otherServicesBreakdownRows: [],
    damageRecoveryBreakdownRows: [], creditNotesBreakdownRows: [],
    expenseDetailBreakdownByCategory: {},
    rentedWithoutCost: reportData.rentedWithoutCost,
    soldWithoutCost: reportData.soldWithoutCost,
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

function renderReport(accountingBasis: "accrual" | "cash" = "accrual") {
  return render(<IncomeStatementReport startDate={new Date(2026, 0, 1)} endDate={new Date(2026, 0, 31)} accountingBasis={accountingBasis} />);
}

beforeEach(() => {
  reportData.isComparison = false;
  reportData.margin = 63.3;
  reportData.rentedWithoutCost = [];
  reportData.soldWithoutCost = [];
});

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

  it("N2: muestra un margen no aplicable con estilo neutral", () => {
    reportData.margin = null;
    renderReport();
    const value = screen.getByText("No aplica");
    expect(value).toHaveAttribute("title", "No aplica");
    expect(value.parentElement?.parentElement?.firstElementChild).toHaveClass("text-muted-foreground");
    expect(value.parentElement?.parentElement?.firstElementChild).not.toHaveClass("text-chart-2", "text-destructive");
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("N3: advierte sobre depreciación faltante en Devengado", () => {
    reportData.rentedWithoutCost = [{ id: "rented-no-cost", name: "Equipo rentado sin costo" }];
    renderReport("accrual");
    expect(screen.getByText("Equipos sin costo de adquisición")).toBeInTheDocument();
    expect(screen.getByText("Equipo rentado sin costo")).toBeInTheDocument();
  });

  it("N3: Efectivo omite la advertencia de depreciación y conserva la de costo de venta", () => {
    reportData.rentedWithoutCost = [{ id: "rented-no-cost", name: "Equipo rentado sin costo" }];
    reportData.soldWithoutCost = [{ id: "sold-no-cost", name: "Equipo vendido sin costo" }];
    renderReport("cash");
    expect(screen.queryByText("Equipos sin costo de adquisición")).not.toBeInTheDocument();
    expect(screen.queryByText("Equipo rentado sin costo")).not.toBeInTheDocument();
    expect(screen.getByText("Equipos vendidos sin costo de adquisición")).toBeInTheDocument();
    expect(screen.getByText("Equipo vendido sin costo")).toBeInTheDocument();
    expect(screen.getByText("(Depreciación excluida en base efectivo)")).toBeInTheDocument();
  });
});
