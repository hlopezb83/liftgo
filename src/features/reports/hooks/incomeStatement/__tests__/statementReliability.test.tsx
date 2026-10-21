import { createElement, type ReactNode } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStatementTotals } from "@/features/reports/hooks/incomeStatement/useStatementTotals";
import {
  buildDepreciationBreakdownRows,
  buildComparisonCsvRows,
} from "@/features/reports/hooks/incomeStatement/statementRowFactories";
import {
  computeDerivedTotals,
  emptyExpenses,
  type MonthData,
} from "@/features/reports/hooks/incomeStatement/types";
import {
  IncomeStatementDocument,
  type IncomeStatementDocumentProps,
} from "@/lib/pdf/documents/IncomeStatementDocument";
import { useStatementRows } from "@/features/reports/hooks/incomeStatement/useStatementRows";
import { getBreakdownFor } from "@/features/reports/components/reports/incomeStatement/incomeStatementHelpers";

vi.mock("@react-pdf/renderer", () => {
  const tag =
    (name: string) =>
    ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement(
        name,
        { "data-pdf-style": JSON.stringify(style) },
        children,
      );
  return {
    Document: tag("section"),
    Page: tag("section"),
    View: tag("div"),
    Text: tag("span"),
    StyleSheet: { create: <T,>(s: T) => s },
  };
});
afterEach(cleanup);

function month(key: string, revenue = 100): MonthData {
  const values = {
    revenue,
    maintenanceCost: 0,
    damageCost: 0,
    depreciation: 0,
    cogsForkliftSales: 0,
    expenses: emptyExpenses(),
  };
  return {
    monthKey: key,
    month: key,
    ...values,
    ...computeDerivedTotals(values),
    revenueRentalBooked: revenue,
    revenueRentalUnbooked: 0,
    revenueSales: 0,
    revenueOtherServices: 0,
    revenueDamageRecovery: 0,
    creditNotes: 0,
    depreciationRented: 0,
    depreciationIdle: 0,
    cogsByForklift: {},
    depreciationByForklift: {},
    rentalBookedByCustomer: {},
    rentalUnbookedByCustomer: {},
    salesByCustomer: {},
    otherServicesByCustomer: {},
    damageRecoveryByCustomer: {},
    creditNotesByCustomer: {},
    expensesDetailByCategory: {},
  };
}
const pdf: IncomeStatementDocumentProps = {
  company: null,
  logoBase64: null,
  filteredData: [{ month: "Oct 26" }],
  statementRows: [{ label: "Ingresos", values: [100], total: 100 }],
  comparisonRows: [],
  yearTotals: [],
  isComparison: false,
  selectedYear: "2026",
  availableYears: ["2026"],
  startDate: new Date(2026, 9, 1),
  endDate: new Date(2026, 9, 31),
};

describe("ER reliability regressions", () => {
  it("ER-UX-03: total-fleet detail belongs to total depreciation, never rented only", () => {
    const record = {
      ...month("2026-10"),
      depreciation: 100,
      depreciationRented: 30,
      depreciationIdle: 70,
      depreciationByForklift: { "Equipo QA": 100 },
    };
    const { result } = renderHook(() => {
      const totals = useStatementTotals([record]);
      return useStatementRows(totals.filteredData, totals.totals);
    });
    const row = result.current.statementRows.find(
      (r) => r.label === "(-) Depreciación (Equipos Rentados)",
    )!;
    expect(
      getBreakdownFor(
        row.label,
        result.current.depreciationBreakdownRows,
        [],
        [],
        [],
        [],
      ),
    ).toBeNull();
    const totalRow = result.current.statementRows.find(
      (r) => r.label === "= Depreciación total",
    )!;
    const detail = getBreakdownFor(
      totalRow.label,
      result.current.depreciationBreakdownRows,
      [],
      [],
      [],
      [],
    )!;
    expect(totalRow.total).toBe(100);
    expect(row.total).toBe(30);
    expect(detail.rows.reduce((sum, r) => sum + r.total, 0)).toBe(100);
  });
  it("ER-UX-01: invalid selected year resets without discarding new period", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useStatementTotals(data),
      { initialProps: { data: [month("2025-12"), month("2026-01")] } },
    );
    act(() => result.current.setSelectedYear("2025"));
    expect(result.current.totals.revenue).toBe(100);
    rerender({ data: [month("2026-10", 900)] });
    expect(result.current.availableYears).toEqual(["2026"]);
    expect(result.current.selectedYear).toBe("all");
    expect(result.current.filteredData).toHaveLength(1);
    expect(result.current.totals.revenue).toBe(900);
  });
  it("ER-UX-01b: comparison resets when fewer than two years remain", () => {
    const { result, rerender } = renderHook(
      ({ data }) => useStatementTotals(data),
      { initialProps: { data: [month("2025-12"), month("2026-01")] } },
    );
    act(() => result.current.setSelectedYear("compare"));
    rerender({ data: [month("2026-10", 900)] });
    expect(result.current.isComparison).toBe(false);
    expect(result.current.selectedYear).toBe("all");
    expect(result.current.totals.revenue).toBe(900);
  });
  it("ER-UX-03: percentage-point delta preserves units in CSV", () => {
    const csv = buildComparisonCsvRows(
      [
        {
          label: "Margen Neto",
          yearValues: [10, 20],
          delta: 10,
          deltaPct: 100,
          isPercent: true,
        },
      ],
      ["2025", "2026"],
    );
    expect(csv[0]["Variación"]).toBe("10.0 pp");
  });
  it("ER-UX-04: PDF names the exact period and preserves basis, currency and exclusions", () => {
    render(
      <IncomeStatementDocument
        {...pdf}
        exportContext={{
          accountingBasis: "cash",
          periodStart: "2026-10-01",
          periodEnd: "2026-10-31",
          generatedAt: "2026-10-21T00:00:00.000Z",
          fxMissingCount: 2,
          rentedWithoutCostCount: 0,
          soldWithoutCostCount: 1,
        }}
      />,
    );
    expect(screen.queryByText("Año 2026")).not.toBeInTheDocument();
    expect(document.body.textContent).toContain("2026-10-01");
    expect(document.body.textContent).toContain("2026-10-31");
    expect(document.body.textContent).toContain("Efectivo");
    expect(document.body.textContent).toContain("MXN");
    expect(document.body.textContent).toContain("2 registros");
    expect(document.body.textContent).toContain(
      "No sustituye la contabilidad oficial",
    );
  });
  it("ER-UX-05: PDF expense increase is unfavorable, matching UI", () => {
    render(
      <IncomeStatementDocument
        {...pdf}
        isComparison
        selectedYear="compare"
        yearTotals={[{ year: "2025" }, { year: "2026" }]}
        availableYears={["2025", "2026"]}
        comparisonRows={[
          {
            label: "Gastos",
            yearValues: [100, 200],
            delta: 100,
            deltaPct: 100,
            isCost: true,
          },
        ]}
      />,
    );
    expect(
      screen.getByText("+$100.00").getAttribute("data-pdf-style"),
    ).toContain("#C83C3C");
  });
});

it("keeps selection during intermediate loading then normalizes after valid data", () => {
  const { result, rerender } = renderHook(
    ({ data, loading }) => useStatementTotals(data, loading),
    {
      initialProps: {
        data: [month("2025-12"), month("2026-01")],
        loading: false,
      },
    },
  );
  act(() => result.current.setSelectedYear("2025"));
  rerender({ data: [], loading: true });
  expect(result.current.selectedYear).toBe("2025");
  rerender({ data: [month("2026-10", 900)], loading: false });
  expect(result.current.selectedYear).toBe("all");
  expect(result.current.totals.revenue).toBe(900);
});
it("labels real depreciation detail gaps honestly and reconciles cents", () => {
  const record = {
    ...month("2026-10"),
    depreciation: 100,
    depreciationByForklift: { "Duplicate name": 40 },
  };
  const rows = buildDepreciationBreakdownRows([record], 100);
  expect(rows.at(-1)?.label).toContain("Diferencia pendiente de explicar");
  expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(100);
  const rounding = {
    ...record,
    depreciation: 0.01,
    depreciationByForklift: { A: 0.005, B: 0.005 },
  };
  const centRows = buildDepreciationBreakdownRows([rounding], 0.01);
  expect(centRows.at(-1)?.label).toContain("Ajuste de redondeo");
  expect(centRows.at(-1)?.total).toBe(-0.01);
});

it("PDF splits 24 months and repeats full-period total, not a misleading block subtotal", () => {
  const months = Array.from({ length: 24 }, (_, i) => ({
    month: `Month ${i + 1}`,
  }));
  render(
    <IncomeStatementDocument
      {...pdf}
      selectedYear="all"
      filteredData={months}
      statementRows={[
        {
          label: "Cost",
          values: months.map(() => -100),
          total: -2400,
          isCost: true,
        },
      ]}
    />,
  );
  expect(screen.getAllByText("TOTAL PERIODO")).toHaveLength(4);
  expect(screen.getAllByText("-$2,400.00")).toHaveLength(4);
  expect(screen.getByText("MONTH 1")).toBeInTheDocument();
  expect(screen.getByText("MONTH 24")).toBeInTheDocument();
  expect(
    screen.getAllByText(/Total periodo corresponde al rango completo/),
  ).toHaveLength(4);
});
