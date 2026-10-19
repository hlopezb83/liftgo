import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildComparisonCsvRows } from "../statementRowFactories";
import { useStatementRows, useComparisonRows } from "../useStatementRows";
import { useStatementTotals } from "../useStatementTotals";
import { computeDerivedTotals, emptyExpenses, type MonthData, type StatementRow } from "../types";
import { formatCell } from "../../../components/reports/incomeStatement/incomeStatementHelpers";

const adjustmentLabel = "Ajuste de redondeo de depreciación";

// An equipment item costing MXN 1,000, with a 48-month life, rented for
// 3 of 31 days. These are the unrounded RPC inputs, not expected output.
function month(monthKey: string, rentedDays = 3, cash = false): MonthData {
  const depreciation = cash ? 0 : 1000 / 48;
  const depreciationRented = depreciation * rentedDays / 31;
  const depreciationIdle = depreciation - depreciationRented;
  const amounts = {
    revenue: 1000, maintenanceCost: 0, damageCost: 0, cogsForkliftSales: 0,
    depreciation, expenses: emptyExpenses(),
  };
  return {
    monthKey, month: monthKey, ...amounts, depreciationRented, depreciationIdle,
    revenueRentalBooked: 1000, revenueRentalUnbooked: 0, revenueSales: 0,
    revenueOtherServices: 0, revenueDamageRecovery: 0, creditNotes: 0,
    depreciationByForklift: { "Equipo sintético": depreciation }, cogsByForklift: {},
    rentalBookedByCustomer: {}, rentalUnbookedByCustomer: {}, salesByCustomer: {},
    otherServicesByCustomer: {}, damageRecoveryByCustomer: {}, creditNotesByCustomer: {},
    expensesDetailByCategory: {}, ...computeDerivedTotals(amounts),
  };
}

function useReportRows(data: MonthData[]) {
  const summary = useStatementTotals(data);
  return {
    ...summary,
    ...useStatementRows(summary.filteredData, summary.totals),
    comparisonRows: useComparisonRows(summary.yearTotals),
  };
}

function depreciationRows(rows: StatementRow[]) {
  return rows.filter((row) => row.label.startsWith("(-) Depreciación") || row.label === adjustmentLabel);
}

// Compare actual displayed cents, rather than repeating the rounding formula.
function displayedCents(row: StatementRow, value: number | null) {
  return Number(formatCell(row, value).replace(/[^\d.-]/g, "")) * 100;
}

describe("R2: depreciation presentation reconciles with the canonical expense", () => {
  it("shows the negative cent explicitly, preserving monthly components and profit", () => {
    const input = month("2026-10");
    const unchanged = structuredClone(input);
    const { result } = renderHook(() => useReportRows([input]));
    const report = result.current;
    expect(report.totals.depreciation).toBe(20.83);
    expect(report.totals.depreciationRented).toBe(2.02);
    expect(report.totals.depreciationIdle).toBe(18.82);
    expect(report.totals.netProfit).toBe(979.17);
    expect(report.totals.totalExpenses).toBe(0);
    const rows = depreciationRows(report.statementRows);
    expect(rows.find((row) => row.label === adjustmentLabel)).toMatchObject({ values: [-0.01], total: -0.01 });
    expect(rows.reduce((sum, row) => sum + displayedCents(row, row.values[0]), 0)).toBe(2083);
    expect(rows.reduce((sum, row) => sum + displayedCents(row, row.total), 0)).toBe(2083);
    expect(report.csvRows.find((row) => row.Concepto === adjustmentLabel)).toEqual({
      Concepto: adjustmentLabel, "2026-10": "-0.01", Total: "-0.01",
    });
    expect(input).toEqual(unchanged);
  });

  it("reconciles each month and the independently rounded range total", () => {
    const { result } = renderHook(() => useReportRows([
      month("2026-10", 3), month("2026-11", 3),
    ]));
    const adjustment = result.current.statementRows.find((row) => row.label === adjustmentLabel);
    expect(adjustment).toMatchObject({ values: [-0.01, -0.01], total: 0.01 });
    // Range components are aggregated before rounding, so their adjustment
    // can differ from the sum of monthly adjustments.
    expect(result.current.totals.netProfit).toBe(1958.33);
    expect(result.current.totals.depreciation).toBe(41.67);
    const rows = depreciationRows(result.current.statementRows);
    for (const column of [0, 1]) {
      expect(rows.reduce((sum, row) => sum + displayedCents(row, row.values[column]), 0)).toBe(2083);
    }
    expect(rows.reduce((sum, row) => sum + displayedCents(row, row.total), 0)).toBe(4167);
  });

  it("carries the same adjustment into comparative rows and CSV", () => {
    const { result } = renderHook(() => useReportRows([
      month("2025-10", 3), month("2026-10", 1),
    ]));
    act(() => result.current.setSelectedYear("compare"));
    const row = result.current.comparisonRows.find((item) => item.label === adjustmentLabel);
    expect(row).toMatchObject({ yearValues: [-0.01, 0], delta: 0.01, isCost: true });
    const csv = buildComparisonCsvRows(result.current.comparisonRows, ["2025", "2026"]);
    expect(csv.find((item) => item.Concepto === adjustmentLabel)).toMatchObject({ "2025": "-0.01", "2026": "0.00" });
    expect(result.current.yearTotals.map((year) => year.netProfit)).toEqual([979.17, 979.17]);
  });

  it.each([0, 1, 31])("omits rounding noise when rented days = %s", (days) => {
    const { result } = renderHook(() => useReportRows([month("2026-10", days)]));
    expect(result.current.statementRows.some((row) => row.label === adjustmentLabel)).toBe(false);
    expect(result.current.totals.netProfit).toBe(979.17);
  });

  it("preserves negative components and shows the opposite adjustment", () => {
    const input = month("2026-10");
    input.depreciation *= -1;
    input.depreciationRented *= -1;
    input.depreciationIdle *= -1;
    Object.assign(input, computeDerivedTotals(input));
    const { result } = renderHook(() => useReportRows([input]));
    const rows = depreciationRows(result.current.statementRows);
    expect(rows.find((row) => row.label === adjustmentLabel)).toMatchObject({ values: [0.01], total: 0.01 });
    expect(rows.reduce((sum, row) => sum + displayedCents(row, row.total), 0)).toBe(-2083);
    expect(result.current.totals.netProfit).toBe(1020.83);
  });

  it("does not add a depreciation adjustment in cash basis", () => {
    const { result } = renderHook(() => useReportRows([month("2026-10", 3, true)]));
    expect(result.current.statementRows.some((row) => row.label === adjustmentLabel)).toBe(false);
    expect(result.current.totals.depreciation).toBe(0);
    expect(result.current.totals.netProfit).toBe(1000);
  });
});
