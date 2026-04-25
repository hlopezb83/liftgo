import {
  type MonthData, type StatementRow, type YearTotals,
  EXPENSE_CATEGORIES, DIRECT_COST_CATEGORIES, EXPENSE_CATEGORY_LABELS,
} from "./types";

interface RowTotals {
  revenue: number; revenueRental: number; revenueSales: number;
  maintenanceCost: number; damageCost: number; depreciation: number;
  expenses: MonthData["expenses"];
  grossProfit: number; grossMargin: number;
  totalExpenses: number; netProfit: number; margin: number;
}

const directCostRows = (filteredData: MonthData[], totals: RowTotals): StatementRow[] =>
  DIRECT_COST_CATEGORIES.map((c) => ({
    label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
    values: filteredData.map((r) => r.expenses[c]),
    total: totals.expenses[c],
    isCost: true,
  }));

const operatingExpenseRows = (filteredData: MonthData[], totals: RowTotals): StatementRow[] =>
  EXPENSE_CATEGORIES.map((c) => ({
    label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
    values: filteredData.map((r) => r.expenses[c]),
    total: totals.expenses[c],
    isCost: true,
  }));

export function buildStatementRows(filteredData: MonthData[], totals: RowTotals): StatementRow[] {
  return [
    { label: "  Ingresos por Rentas", values: filteredData.map((r) => r.revenueRental), total: totals.revenueRental },
    { label: "  Ingresos por Ventas", values: filteredData.map((r) => r.revenueSales), total: totals.revenueSales },
    { label: "= Total Ingresos", values: filteredData.map((r) => r.revenue), total: totals.revenue, isSubtotal: true },
    { label: "(-) Mantenimiento", values: filteredData.map((r) => r.maintenanceCost), total: totals.maintenanceCost, isCost: true },
    { label: "(-) Daños", values: filteredData.map((r) => r.damageCost), total: totals.damageCost, isCost: true },
    ...directCostRows(filteredData, totals),
    { label: "= Utilidad Bruta", values: filteredData.map((r) => r.grossProfit), total: totals.grossProfit, isSubtotal: true },
    { label: "Margen Bruto", values: filteredData.map((r) => r.grossMargin), total: totals.grossMargin, isPercent: true },
    ...operatingExpenseRows(filteredData, totals),
    { label: "= Total Egresos", values: filteredData.map((r) => r.totalExpenses), total: totals.totalExpenses, isSubtotal: true, isCost: true },
    { label: "(-) Depreciación (Equipos Rentados)", values: filteredData.map((r) => r.depreciation), total: totals.depreciation, isCost: true },
    { label: "= Utilidad Neta", values: filteredData.map((r) => r.netProfit), total: totals.netProfit, isSubtotal: true },
    { label: "Margen Neto", values: filteredData.map((r) => r.margin), total: totals.margin, isPercent: true },
  ];
}

export function buildBreakdownRows(
  filteredData: MonthData[],
  selector: (m: MonthData) => Record<string, number>,
  isCost = false,
): StatementRow[] {
  const allNames = new Set<string>();
  filteredData.forEach((r) => Object.keys(selector(r)).forEach((n) => allNames.add(n)));
  return [...allNames].sort().map((name) => ({
    label: `      ${name}`,
    values: filteredData.map((r) => selector(r)[name] ?? 0),
    total: filteredData.reduce((s, r) => s + (selector(r)[name] ?? 0), 0),
    isCost: isCost || undefined,
  }));
}

export function buildCsvRows(statementRows: StatementRow[], filteredData: MonthData[]): Record<string, string>[] {
  return statementRows.map((row) => {
    const obj: Record<string, string> = { Concepto: row.label };
    filteredData.forEach((d, i) => {
      obj[d.month] = row.isPercent ? `${row.values[i].toFixed(1)}%` : row.values[i].toFixed(2);
    });
    obj["Total"] = row.isPercent ? `${row.total.toFixed(1)}%` : row.total.toFixed(2);
    return obj;
  });
}

interface ComparisonValueOptions {
  isCost?: boolean;
  isSubtotal?: boolean;
  isPercent?: boolean;
}

export function buildComparisonValues(
  yearTotals: YearTotals[],
  extractor: (yt: YearTotals) => number,
  opts?: ComparisonValueOptions,
) {
  const vals = yearTotals.map(extractor);
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  const delta = last - prev;
  const deltaPct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : null;
  return { yearValues: vals, delta, deltaPct, ...opts };
}
