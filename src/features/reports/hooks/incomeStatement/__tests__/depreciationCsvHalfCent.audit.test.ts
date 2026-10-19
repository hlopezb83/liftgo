import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatCell } from "../../../components/reports/incomeStatement/incomeStatementHelpers";
import { buildComparisonCsvRows, buildCsvRows, buildStatementRows } from "../statementRowFactories";
import { computeDerivedTotals, emptyExpenses, type MonthData, type StatementRow, type ComparisonRow } from "../types";
import { useComparisonRows } from "../useStatementRows";

// Raw RPC-like precision is intentional: 972 / 48 = 20.25, split over
// 3 rented days in a 30-day month gives exactly 2.025 and 18.225.
function rawMonth(sign: number): MonthData {
  const depreciation = sign * 972 / 48;
  const depreciationRented = depreciation * 3 / 30;
  const amounts = {
    revenue: 1000, maintenanceCost: 0, damageCost: 0, cogsForkliftSales: 0,
    depreciation, expenses: emptyExpenses(),
  };
  return {
    monthKey: "2026-11", month: "Nov", ...amounts,
    depreciationRented, depreciationIdle: depreciation - depreciationRented,
    revenueRentalBooked: 1000, revenueRentalUnbooked: 0, revenueSales: 0,
    revenueOtherServices: 0, revenueDamageRecovery: 0, creditNotes: 0,
    depreciationByForklift: {}, cogsByForklift: {}, rentalBookedByCustomer: {},
    rentalUnbookedByCustomer: {}, salesByCustomer: {}, otherServicesByCustomer: {},
    damageRecoveryByCustomer: {}, creditNotesByCustomer: {}, expensesDetailByCategory: {},
    ...computeDerivedTotals(amounts),
  };
}

function isDepreciation(row: { label: string }) {
  return row.label.startsWith("(-) Depreciación") || row.label === "Ajuste de redondeo de depreciación";
}

// The screen and PDF share this real currency formatter. Compare its decimal
// text with the CSV builder, rather than restating a rounding algorithm.
function visibleDecimal(row: StatementRow | ComparisonRow, value: number | null) {
  return formatCell(row, value).replace(/[^\d.-]/g, "");
}

function cents(text: string) {
  return Math.round(Number(text) * 100);
}

describe("R2 review: CSV and visible half-cent depreciation amounts", () => {
  it.each([1, -1])("monthly CSV matches visible raw values, sign %s", (sign) => {
    const input = rawMonth(sign);
    const unchanged = structuredClone(input);
    const rows = buildStatementRows([input], input);
    const csv = buildCsvRows(rows, [input]);
    expect(input.depreciationRented).toBe(sign * 2.025);
    expect(input.depreciationIdle).toBe(sign * 18.225);
    const rental = rows.find((row) => row.label === "(-) Depreciación (Equipos Rentados)")!;
    expect(visibleDecimal(rental, rental.values[0])).toBe(sign > 0 ? "2.03" : "-2.03");
    for (const row of rows.filter(isDepreciation)) {
      const exported = csv.find((item) => item.Concepto === row.label)!;
      expect(exported.Nov).toBe(visibleDecimal(row, row.values[0]));
      expect(exported.Total).toBe(visibleDecimal(row, row.total));
    }
    const exportedDepreciation = csv.filter((row) => isDepreciation({ label: row.Concepto }));
    expect(exportedDepreciation.reduce((sum, row) => sum + cents(row.Nov), 0)).toBe(sign * 2025);
    expect(exportedDepreciation.reduce((sum, row) => sum + cents(row.Total), 0)).toBe(sign * 2025);
    expect(csv.find((row) => row.Concepto === "= Utilidad Neta")?.Total).toBe(sign > 0 ? "979.75" : "1020.25");
    expect(input).toEqual(unchanged);
  });

  it.each([1, -1])("comparative CSV matches raw year and delta values, sign %s", (sign) => {
    const years = [{ ...rawMonth(0), year: "2025" }, { ...rawMonth(sign), year: "2026" }];
    const unchanged = structuredClone(years);
    const { result } = renderHook(() => useComparisonRows(years));
    const rows = result.current;
    const csv = buildComparisonCsvRows(rows, ["2025", "2026"]);
    for (const row of rows.filter(isDepreciation)) {
      const exported = csv.find((item) => item.Concepto === row.label)!;
      expect(exported["2025"]).toBe(visibleDecimal(row, row.yearValues[0]));
      expect(exported["2026"]).toBe(visibleDecimal(row, row.yearValues[1]));
      expect(exported["Variación"]).toBe(visibleDecimal(row, row.delta));
    }
    const exportedDepreciation = csv.filter((row) => isDepreciation({ label: row.Concepto }));
    expect(exportedDepreciation.reduce((sum, row) => sum + cents(row["2026"]), 0)).toBe(sign * 2025);
    expect(exportedDepreciation.reduce((sum, row) => sum + cents(row["Variación"]), 0)).toBe(sign * 2025);
    expect(csv.find((row) => row.Concepto === "= Utilidad Neta")?.["2026"]).toBe(sign > 0 ? "979.75" : "1020.25");
    expect(years).toEqual(unchanged);
  });

  it("keeps all monetary CSV text aligned without changing percent or unavailable values", () => {
    const rows: StatementRow[] = [
      { label: "Importe", values: [1.005, -1.005], total: 2.025 },
      { label: "Margen", values: [2.025, null], total: null, isPercent: true },
    ];
    const unchanged = structuredClone(rows);
    const csv = buildCsvRows(rows, [{ month: "Nov" }, { month: "Dic" }] as MonthData[]);
    expect(csv[0]).toEqual({ Concepto: "Importe", Nov: "1.01", Dic: "-1.01", Total: "2.03" });
    expect(csv[1]).toEqual({ Concepto: "Margen", Nov: "2.0%", Dic: "No aplica", Total: "No aplica" });
    expect(rows).toEqual(unchanged);
  });
});
