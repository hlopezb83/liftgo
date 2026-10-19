import { createElement, type ReactNode } from "react";
import { render, renderHook, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Table, TableBody } from "@/components/ui/table";
import { IncomeStatementDocument } from "@/lib/pdf/documents/IncomeStatementDocument";
import { ComparisonTable } from "../../../components/reports/incomeStatement/ComparisonTable";
import { StatementTableRow } from "../../../components/reports/incomeStatement/StatementTableRow";
import { DEPRECIATION_ROUNDING_LABEL, depreciationRoundingAdjustment } from "../depreciationPresentation";
import { buildComparisonCsvRows, buildCsvRows, buildStatementRows } from "../statementRowFactories";
import { computeDerivedTotals, emptyExpenses, type MonthData } from "../types";
import { useComparisonRows } from "../useStatementRows";

// Only the PDF drawing primitives are simulated. Its real document, row
// components and currency formatter execute, just as the real HTML table does.
vi.mock("@react-pdf/renderer", () => {
  const tag = (name: string) => ({ children }: { children?: ReactNode }) => createElement(name, null, children);
  return {
    Document: tag("section"), Page: tag("section"), View: tag("div"), Text: tag("span"),
    StyleSheet: { create: <T,>(styles: T) => styles },
  };
});

// Same unrounded formula as depreciation_per_forklift_month in the RPC:
// acquisition / 48 * activeDays / monthDays; split by rentedDays / monthDays.
const rpcTotal = (46358.63 / 48) * (1 / 31);
const boundaries = [
  { name: "just below half cent", depreciation: 100, rented: 50.0049999, idle: 49.9950001, cents: 10000, adjustment: 0, profit: [900, 1100] },
  { name: "RPC one active/rented day", depreciation: rpcTotal, rented: rpcTotal / 31, idle: rpcTotal * (1 - 1 / 31), cents: 3115, adjustment: 0, profit: [968.85, 1031.15] },
  { name: "just above half cent", depreciation: 100, rented: 50.0050001, idle: 49.9949999, cents: 10000, adjustment: 0, profit: [900, 1100] },
  { name: "exact half cent control", depreciation: 20.25, rented: 2.025, idle: 18.225, cents: 2025, adjustment: -0.01, profit: [979.75, 1020.25] },
];
const cases = boundaries.flatMap((boundary) => [1, -1].map((sign) => ({ ...boundary, sign })));

function month(test: typeof cases[number], zero = false): MonthData {
  const factor = zero ? 0 : test.sign;
  const amounts = {
    revenue: 1000, maintenanceCost: 0, damageCost: 0, cogsForkliftSales: 0,
    depreciation: test.depreciation * factor, expenses: emptyExpenses(),
  };
  return {
    monthKey: "2026-10", month: "Oct", ...amounts,
    depreciationRented: test.rented * factor, depreciationIdle: test.idle * factor,
    revenueRentalBooked: 1000, revenueRentalUnbooked: 0, revenueSales: 0,
    revenueOtherServices: 0, revenueDamageRecovery: 0, creditNotes: 0,
    depreciationByForklift: {}, cogsByForklift: {}, rentalBookedByCustomer: {},
    rentalUnbookedByCustomer: {}, salesByCustomer: {}, otherServicesByCustomer: {},
    damageRecoveryByCustomer: {}, creditNotesByCustomer: {}, expensesDetailByCategory: {},
    ...computeDerivedTotals(amounts),
  };
}

const isDepreciation = (row: { label: string }) => row.label.startsWith("(-) Depreciación") || row.label === DEPRECIATION_ROUNDING_LABEL;
const cents = (text: string) => Math.round(Number(text.replace(/[^\d.-]/g, "")) * 100);
const pdfProps = {
  company: null, logoBase64: null, selectedYear: "all", availableYears: ["2025", "2026"],
  startDate: new Date("2025-01-01"), endDate: new Date("2026-12-31"),
};

describe("R2 review: one visible Intl rounding convention", () => {
  it.each(cases)("monthly UI, CSV and PDF: $name, sign $sign", (test) => {
    const input = month(test);
    const unchanged = structuredClone(input);
    const rows = buildStatementRows([input], input).filter(isDepreciation);
    const csv = buildCsvRows(rows, [input]);
    const view = render(<>
      <div data-testid="html"><Table><TableBody>{rows.map((row) => <StatementTableRow
        key={row.label} row={row} breakdownRows={[]} isExpandable={false} isOpen={false} toggle={() => {}} filteredCols={1}
      />)}</TableBody></Table></div>
      <div data-testid="pdf"><IncomeStatementDocument {...pdfProps} filteredData={[input]} statementRows={rows}
        comparisonRows={[]} yearTotals={[]} isComparison={false} /></div>
    </>);
    const expectedCents = test.cents * test.sign;
    expect.soft(depreciationRoundingAdjustment(input)).toBe(test.adjustment === 0 ? 0 : test.adjustment * test.sign);
    expect.soft(rows.some((row) => row.label === DEPRECIATION_ROUNDING_LABEL)).toBe(test.adjustment !== 0);
    for (const column of [0, 1]) {
      const htmlSum = within(view.getByTestId("html")).getAllByRole("row").reduce((sum, row) =>
        sum + cents(within(row).getAllByRole("cell")[column + 1].textContent ?? ""), 0);
      const pdfSum = rows.reduce((sum, row) => {
        const cells = within(view.getByTestId("pdf")).getByText(row.label).parentElement!.children;
        return sum + cents(cells[column + 1].textContent ?? "");
      }, 0);
      const csvSum = csv.reduce((sum, row) => sum + cents(row[column === 0 ? "Oct" : "Total"]), 0);
      expect.soft(htmlSum).toBe(expectedCents);
      expect.soft(pdfSum).toBe(expectedCents);
      expect.soft(csvSum).toBe(expectedCents);
    }
    expect(input.netProfit).toBe(test.profit[test.sign > 0 ? 0 : 1]);
    expect(input).toEqual(unchanged);
  });

  it.each(cases)("comparative UI, CSV and PDF: $name, sign $sign", (test) => {
    const years = [{ ...month(test, true), year: "2025" }, { ...month(test), year: "2026" }];
    const unchanged = structuredClone(years);
    const { result } = renderHook(() => useComparisonRows(years));
    const rows = result.current.filter(isDepreciation);
    const csv = buildComparisonCsvRows(rows, ["2025", "2026"]);
    const view = render(<>
      <div data-testid="html"><ComparisonTable comparisonRows={rows} yearTotals={years} /></div>
      <div data-testid="pdf"><IncomeStatementDocument {...pdfProps} filteredData={[]} statementRows={[]}
        comparisonRows={rows} yearTotals={years} isComparison /></div>
    </>);
    const expectedCents = test.cents * test.sign;
    expect.soft(rows.some((row) => row.label === DEPRECIATION_ROUNDING_LABEL)).toBe(test.adjustment !== 0);
    for (const column of [1, 2]) {
      // Column 1 is current year; column 2 is delta from the zero-depreciation year.
      const htmlSum = within(view.getByTestId("html")).getAllByRole("row").slice(1).reduce((sum, row) =>
        sum + cents(within(row).getAllByRole("cell")[column + 1].textContent ?? ""), 0);
      const pdfSum = rows.reduce((sum, row) => {
        const cells = within(view.getByTestId("pdf")).getByText(row.label).parentElement!.children;
        return sum + cents(cells[column + 1].textContent ?? "");
      }, 0);
      const csvSum = csv.reduce((sum, row) => sum + cents(row[column === 1 ? "2026" : "Variación"]), 0);
      expect.soft(htmlSum).toBe(expectedCents);
      expect.soft(pdfSum).toBe(expectedCents);
      expect.soft(csvSum).toBe(expectedCents);
    }
    expect(years[1].netProfit).toBe(test.profit[test.sign > 0 ? 0 : 1]);
    expect(years).toEqual(unchanged);
  });
});
