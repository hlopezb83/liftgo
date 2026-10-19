import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeStatementReport } from "../IncomeStatementReport";

const reportData = vi.hoisted(() => ({
  isComparison: false,
  margin: 63.3 as number | null,
  depreciation: 10000,
  depreciationRented: 8000,
  depreciationIdle: 2000,
  roundingContext: null as "monthly" | "comparison" | null,
  rentedWithoutCost: [] as { id: string; name: string }[],
  soldWithoutCost: [] as { id: string; name: string }[],
}));

vi.mock("../../../hooks/useIncomeStatementData", () => ({
  useIncomeStatementData: () => ({
    totals: {
      revenue: 150000,
      totalExpenses: 45000,
      depreciation: reportData.depreciation,
      depreciationRented: reportData.depreciationRented,
      depreciationIdle: reportData.depreciationIdle,
      netProfit: 95000,
      margin: reportData.margin,
    },
    filteredData: [],
    statementRows: reportData.roundingContext === "monthly"
      ? [{ label: "Ajuste de redondeo de depreciación", values: [-0.01], total: -0.01 }] : [],
    comparisonRows: reportData.roundingContext === "comparison"
      ? [{ label: "Ajuste de redondeo de depreciación", yearValues: [-0.01, 0], delta: 0.01, deltaPct: 100 }] : [],
    yearTotals: [],
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
  reportData.depreciation = 10000;
  reportData.depreciationRented = 8000;
  reportData.depreciationIdle = 2000;
  reportData.roundingContext = null;
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

  it("R2: el KPI usa la depreciación canónica que descuenta la utilidad", () => {
    reportData.depreciation = 20.83;
    reportData.depreciationRented = 2.02;
    reportData.depreciationIdle = 18.82;
    renderReport();
    const label = screen.getByText("Depreciación total");
    expect(label.parentElement).toHaveTextContent("$20.83");
    expect(label.parentElement).not.toHaveTextContent("$20.84");
  });

  it.each(["monthly", "comparison"] as const)("R2: explica el ajuste visible en %s", (context) => {
    reportData.roundingContext = context;
    reportData.isComparison = context === "comparison";
    renderReport();
    expect(screen.getByText(/El ajuste de redondeo concilia/)).toHaveTextContent("No modifica la utilidad.");
  });

  it("R2: omite la explicación cuando no hay diferencia mostrada", () => {
    renderReport("cash");
    expect(screen.queryByText(/El ajuste de redondeo concilia/)).not.toBeInTheDocument();
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
