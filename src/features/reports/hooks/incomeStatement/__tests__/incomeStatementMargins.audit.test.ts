import { describe, expect, it } from "vitest";
import { buildComparisonCsvRows, buildComparisonValues, buildCsvRows } from "../statementRowFactories";
import { computeDerivedTotals, emptyExpenses, type MonthData, type StatementRow, type YearTotals } from "../types";
import { cellColor, formatCell, formatRowDelta } from "../../../components/reports/incomeStatement/incomeStatementHelpers";

describe("N2: márgenes con ingresos no positivos", () => {
  it.each([0, -200])("revenue %s: no aplica sin modificar importes", (revenue) => {
    const totals = computeDerivedTotals({
      revenue, maintenanceCost: 10, damageCost: 5, depreciation: 100,
      cogsForkliftSales: 20, expenses: { ...emptyExpenses(), combustible: 15, nomina: 30 },
    });
    expect(totals).toEqual({
      grossProfit: revenue - 50, grossMargin: null,
      totalExpenses: 80, profitBeforeDepreciation: revenue - 80,
      marginBeforeDepreciation: null, netProfit: revenue - 180, margin: null,
    });
  });

  it("un margen real de cero con ingresos positivos sigue siendo 0%", () => {
    const totals = computeDerivedTotals({
      revenue: 100, maintenanceCost: 100, damageCost: 0, depreciation: 0,
      cogsForkliftSales: 0, expenses: emptyExpenses(),
    });
    expect(totals.grossMargin).toBe(0);
    expect(totals.marginBeforeDepreciation).toBe(0);
    expect(totals.margin).toBe(0);
  });

  it("tabla y CSV mensual conservan No aplica en lugar de 0%", () => {
    const row: StatementRow = { label: "Margen Neto", values: [null, 0], total: null, isPercent: true };
    expect(formatCell(row, null)).toBe("No aplica");
    expect(formatCell(row, 0)).toBe("0.0%");
    expect(cellColor(row, null)).toBe("text-muted-foreground");
    expect(buildCsvRows([row], [{ month: "Ene" }, { month: "Feb" }] as MonthData[])).toEqual([
      { Concepto: "Margen Neto", Ene: "No aplica", Feb: "0.0%", Total: "No aplica" },
    ]);
  });

  it.each([[null, 25], [25, null], [null, null]])("comparativo %s / %s no calcula variación artificial", (prev, last) => {
    const comparison = {
      label: "Margen Neto",
      ...buildComparisonValues(
        [{ margin: prev }, { margin: last }] as YearTotals[], (year) => year.margin, { isPercent: true },
      ),
    };
    expect(comparison.yearValues).toEqual([prev, last]);
    expect(comparison.delta).toBeNull();
    expect(comparison.deltaPct).toBeNull();
    expect(formatRowDelta(comparison)).toBe("No aplica");
    expect(buildComparisonCsvRows([comparison], ["2025", "2026"])[0]).toEqual({
      Concepto: "Margen Neto", "2025": prev === null ? "No aplica" : "25.0%",
      "2026": last === null ? "No aplica" : "25.0%", Variación: "No aplica", "Variación %": "—",
    });
  });
});
