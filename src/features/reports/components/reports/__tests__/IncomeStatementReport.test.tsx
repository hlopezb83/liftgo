import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIncomeStatementData } from "../../../hooks/useIncomeStatementData";
import { IncomeStatementReport } from "../IncomeStatementReport";

vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "user:org:internal" }));

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
  useIncomeStatementData: vi.fn(() => ({
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
  })),
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
  vi.clearAllMocks();
  reportData.isComparison = false;
  reportData.margin = 63.3;
  reportData.depreciation = 10000;
  reportData.depreciationRented = 8000;
  reportData.depreciationIdle = 2000;
  reportData.roundingContext = null;
  reportData.rentedWithoutCost = [];
  reportData.soldWithoutCost = [];
});

describe("IncomeStatementReport · moneda, IVA y fechas (MEJ-002)", () => {
  it.each(["accrual", "cash"] as const)("explica MXN y no promete que todos los costos estén sin IVA en %s", (basis) => {
    renderReport(basis);
    const note = screen.getByRole("region", { name: "Moneda, IVA y fechas del reporte" });
    expect(note).toHaveTextContent("MXN (pesos mexicanos)");
    expect(note).toHaveTextContent("facturas, notas de crédito y proveedores usan el subtotal sin IVA");
    expect(note).toHaveTextContent("Mantenimiento, daños y gastos operativos usan el importe registrado, sin separar IVA");
    expect(note).toHaveTextContent("Los documentos en divisa se convierten a MXN");
    expect(note).toHaveTextContent("los que no tienen el tipo requerido se excluyen");
    // La ayuda usa un disclosure nativo, sin tooltip de mouse ni alerta intrusiva.
    const summary = within(note).getByText("Ver criterios por partida");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.parentElement?.tagName).toBe("DETAILS");
    expect(summary.parentElement).not.toHaveAttribute("open");
  });

  it("explica emisión y cobertura en devengado y conserva las fechas propias", () => {
    renderReport();
    const note = screen.getByRole("region", { name: "Moneda, IVA y fechas del reporte" });
    expect(note).toHaveTextContent("Facturas por fecha de emisión. Proveedores por fecha de emisión o prorrateo de su período de cobertura");
    expect(note).toHaveTextContent("Notas de crédito: por fecha de emisión, también en efectivo");
    expect(note).toHaveTextContent("Gastos operativos: por fecha del gasto, en ambas bases");
    expect(note).toHaveTextContent("Mantenimiento completado: por fecha de realización, en ambas bases");
    expect(note).toHaveTextContent("Daños: por fecha de reparación o, si falta, de creación");
    expect(note).toHaveTextContent("Depreciación: cálculo mensual desde la adquisición del equipo");
    expect(note).not.toHaveTextContent("si la factura de proveedor no tiene total positivo");
  });

  it("explica cobros/pagos sin mover notas de crédito ni otros costos a la fecha de pago", () => {
    renderReport("cash");
    const note = screen.getByRole("region", { name: "Moneda, IVA y fechas del reporte" });
    expect(note).toHaveTextContent("Facturas por fecha de cobro y proveedores por fecha de pago");
    expect(note).toHaveTextContent("No equivale a una conciliación bancaria");
    expect(note).toHaveTextContent("si la factura de proveedor no tiene total positivo, se usa el pago sin separar IVA");
    expect(note).toHaveTextContent("Notas de crédito: por fecha de emisión, también en efectivo");
    expect(note).toHaveTextContent("proporción acumulada cobrada de su factura, hasta el 100%");
    expect(note).toHaveTextContent("incluidos cobros fuera del período consultado");
    expect(note).toHaveTextContent("no por la fecha de devolución de dinero");
    expect(note).toHaveTextContent("Costo de equipos vendidos: el automático sigue la fecha de la factura de venta en devengado o del cobro en efectivo");
    expect(note).toHaveTextContent("Depreciación excluida en base efectivo");
    expect(note).not.toHaveTextContent("Depreciación: cálculo mensual");
  });

  it("actualiza la explicación al cambiar de base sin alterar período, importes ni argumentos del hook", () => {
    const startDate = new Date(2026, 0, 1);
    const endDate = new Date(2026, 0, 31);
    const { rerender } = render(<IncomeStatementReport startDate={startDate} endDate={endDate} accountingBasis="accrual" />);
    expect(useIncomeStatementData).toHaveBeenLastCalledWith({ startDate, endDate, accountingBasis: "accrual" });
    rerender(<IncomeStatementReport startDate={startDate} endDate={endDate} accountingBasis="cash" />);
    expect(useIncomeStatementData).toHaveBeenLastCalledWith({ startDate, endDate, accountingBasis: "cash" });
    expect(screen.getByRole("region", { name: "Moneda, IVA y fechas del reporte" })).toHaveTextContent("Facturas por fecha de cobro");
    for (const [, value] of expectedKpis) expect(screen.getByText(value)).toBeInTheDocument();
    rerender(<IncomeStatementReport startDate={startDate} endDate={endDate} accountingBasis="accrual" />);
    expect(screen.getByRole("region", { name: "Moneda, IVA y fechas del reporte" })).toHaveTextContent("Facturas por fecha de emisión");
    expect(screen.queryByText("(Depreciación excluida en base efectivo)")).not.toBeInTheDocument();
  });

  it("mantiene la explicación visible en el comparativo anual", () => {
    reportData.isComparison = true;
    renderReport("cash");
    expect(screen.getByRole("region", { name: "Moneda, IVA y fechas del reporte" })).toHaveTextContent("MXN (pesos mexicanos)");
    expect(screen.queryByText("$150,000.00")).not.toBeInTheDocument();
  });
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
