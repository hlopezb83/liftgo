import { describe, it, expect } from "vitest";
import { buildBreakdownRows, buildCsvRows, buildComparisonValues } from "../statementRowFactories";
import type { MonthData, StatementRow, YearTotals } from "../types";

const monthsBase: MonthData[] = [
  {
    month: "Ene", revenue: 100, revenueRentalBooked: 80, revenueRentalUnbooked: 0, revenueSales: 20,
    maintenanceCost: 10, damageCost: 5, depreciation: 8,
    expenses: {} as MonthData["expenses"],
    grossProfit: 0, grossMargin: 0, totalExpenses: 0,
    profitBeforeDepreciation: 0, marginBeforeDepreciation: 0,
    netProfit: 0, margin: 0,
  } as unknown as MonthData,
  {
    month: "Feb", revenue: 200, revenueRentalBooked: 150, revenueRentalUnbooked: 0, revenueSales: 50,
    maintenanceCost: 20, damageCost: 0, depreciation: 8,
    expenses: {} as MonthData["expenses"],
    grossProfit: 0, grossMargin: 0, totalExpenses: 0,
    profitBeforeDepreciation: 0, marginBeforeDepreciation: 0,
    netProfit: 0, margin: 0,
  } as unknown as MonthData,
];

describe("buildBreakdownRows", () => {
  it("agrupa por nombre, ordena alfabéticamente y suma totales", () => {
    const sel = (m: MonthData) =>
      m.month === "Ene" ? { Acme: 100, Beta: 50 } : { Beta: 75, Acme: 25 };
    const rows = buildBreakdownRows(monthsBase, sel, true);
    expect(rows.map((r) => r.label.trim())).toEqual(["Acme", "Beta"]);
    expect(rows[0].values).toEqual([100, 25]);
    expect(rows[0].total).toBe(125);
    expect(rows[1].total).toBe(125);
    expect(rows[0].isCost).toBe(true);
  });

  it("usa 0 cuando una llave falta en algún mes", () => {
    const sel = (m: MonthData): Record<string, number> => (m.month === "Ene" ? { Solo: 10 } : {});
    const rows = buildBreakdownRows(monthsBase, sel);
    expect(rows[0].values).toEqual([10, 0]);
    expect(rows[0].total).toBe(10);
    expect(rows[0].isCost).toBeUndefined();
  });
});

describe("buildCsvRows", () => {
  it("formatea porcentajes con 1 decimal y montos con 2 decimales", () => {
    const stmt: StatementRow[] = [
      { label: "Ingresos", values: [100.5, 200.25], total: 300.75 },
      { label: "Margen", values: [25.456, 30.111], total: 27.78, isPercent: true },
    ];
    const csv = buildCsvRows(stmt, monthsBase);
    expect(csv[0]).toEqual({ Concepto: "Ingresos", Ene: "100.50", Feb: "200.25", Total: "300.75" });
    expect(csv[1]).toEqual({ Concepto: "Margen", Ene: "25.5%", Feb: "30.1%", Total: "27.8%" });
  });
});

describe("buildComparisonValues", () => {
  const yt: YearTotals[] = [
    { revenue: 1000 } as YearTotals,
    { revenue: 1500 } as YearTotals,
  ];
  it("calcula delta y deltaPct entre último y penúltimo", () => {
    const r = buildComparisonValues(yt, (y) => y.revenue);
    expect(r.yearValues).toEqual([1000, 1500]);
    expect(r.delta).toBe(500);
    expect(r.deltaPct).toBeCloseTo(50, 5);
  });

  it("usa abs(prev) para que deltaPct sea positivo cuando mejora desde negativo", () => {
    const r = buildComparisonValues(
      [{ revenue: -200 } as YearTotals, { revenue: 100 } as YearTotals],
      (y) => y.revenue,
    );
    expect(r.delta).toBe(300);
    expect(r.deltaPct).toBeCloseTo(150, 5); // 300 / 200
  });

  it("deltaPct es null cuando prev = 0", () => {
    const r = buildComparisonValues(
      [{ revenue: 0 } as YearTotals, { revenue: 100 } as YearTotals],
      (y) => y.revenue,
    );
    expect(r.delta).toBe(100);
    expect(r.deltaPct).toBeNull();
  });

  it("propaga flags opcionales (isCost/isPercent/isSubtotal)", () => {
    const r = buildComparisonValues(yt, (y) => y.revenue, { isCost: true, isPercent: true });
    expect(r.isCost).toBe(true);
    expect(r.isPercent).toBe(true);
  });
});
