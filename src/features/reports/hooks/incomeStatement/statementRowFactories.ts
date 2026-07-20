import { sumMoney } from "@/lib/money";
import {
  type ExpenseCategory,
  type MonthData, type StatementRow, type YearTotals,
  EXPENSE_CATEGORY_LABELS, DIRECT_COST_CATEGORIES, OPERATING_EXPENSE_GROUPS,
} from "./types";

interface RowTotals {
  revenue: number; revenueRentalBooked: number; revenueRentalUnbooked: number; revenueSales: number;
  revenueDamageRecovery: number;
  maintenanceCost: number; damageCost: number; depreciation: number;
  depreciationRented: number; depreciationIdle: number;
  cogsForkliftSales: number;
  expenses: MonthData["expenses"];
  grossProfit: number; grossMargin: number;
  totalExpenses: number;
  profitBeforeDepreciation: number; marginBeforeDepreciation: number;
  netProfit: number; margin: number;
}


const directCostRows = (filteredData: MonthData[], totals: RowTotals): StatementRow[] =>
  DIRECT_COST_CATEGORIES.map((c) => ({
    label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
    values: filteredData.map((r) => r.expenses[c]),
    total: totals.expenses[c],
    isCost: true,
  }));

const operatingExpenseGroupRows = (filteredData: MonthData[], totals: RowTotals): StatementRow[] => {
  const rows: StatementRow[] = [];
  for (const group of OPERATING_EXPENSE_GROUPS) {
    for (const c of group.categories) {
      rows.push({
        label: `  (-) ${EXPENSE_CATEGORY_LABELS[c]}`,
        values: filteredData.map((r) => r.expenses[c]),
        total: totals.expenses[c],
        isCost: true,
      });
    }
    const groupValues = filteredData.map((r) =>
      sumMoney(group.categories.map((c) => r.expenses[c])),
    );
    rows.push({
      label: `= Total ${group.label}`,
      values: groupValues,
      total: sumMoney(group.categories.map((c) => totals.expenses[c])),
      isSubtotal: true,
      isCost: true,
    });
  }
  return rows;
};


export function buildStatementRows(filteredData: MonthData[], totals: RowTotals): StatementRow[] {
  return [
    { label: "  Ingresos por Rentas (con reserva)", values: filteredData.map((r) => r.revenueRentalBooked), total: totals.revenueRentalBooked },
    { label: "  Ingresos por Rentas (sin reserva)", values: filteredData.map((r) => r.revenueRentalUnbooked), total: totals.revenueRentalUnbooked },
    { label: "  Ingresos por Ventas de Equipo", values: filteredData.map((r) => r.revenueSales), total: totals.revenueSales },
    { label: "  Recuperación de Daños", values: filteredData.map((r) => r.revenueDamageRecovery), total: totals.revenueDamageRecovery },
    { label: "= Total Ingresos", values: filteredData.map((r) => r.revenue), total: totals.revenue, isSubtotal: true },
    { label: "(-) Mantenimiento", values: filteredData.map((r) => r.maintenanceCost), total: totals.maintenanceCost, isCost: true },
    { label: "(-) Daños", values: filteredData.map((r) => r.damageCost), total: totals.damageCost, isCost: true },
    ...directCostRows(filteredData, totals),
    { label: "(-) Costo de Equipos Vendidos", values: filteredData.map((r) => r.cogsForkliftSales), total: totals.cogsForkliftSales, isCost: true },

    { label: "= Utilidad Bruta", values: filteredData.map((r) => r.grossProfit), total: totals.grossProfit, isSubtotal: true },
    { label: "Margen Bruto", values: filteredData.map((r) => r.grossMargin), total: totals.grossMargin, isPercent: true },
    ...operatingExpenseGroupRows(filteredData, totals),
    { label: "= Total Egresos", values: filteredData.map((r) => r.totalExpenses), total: totals.totalExpenses, isSubtotal: true, isCost: true },
    { label: "= Utilidad antes de Depreciación", values: filteredData.map((r) => r.profitBeforeDepreciation), total: totals.profitBeforeDepreciation, isSubtotal: true },
    { label: "Margen antes de Depreciación", values: filteredData.map((r) => r.marginBeforeDepreciation), total: totals.marginBeforeDepreciation, isPercent: true },
    { label: "(-) Depreciación (Equipos Rentados)", values: filteredData.map((r) => r.depreciationRented), total: totals.depreciationRented, isCost: true },
    { label: "(-) Depreciación (Flota Ociosa)", values: filteredData.map((r) => r.depreciationIdle), total: totals.depreciationIdle, isCost: true },
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
    total: sumMoney(filteredData.map((r) => selector(r)[name] ?? 0)),
    isCost: isCost || undefined,
  }));
}

// PL-05: build per-supplier·description breakdown for a given expense category.
export function buildExpenseDetailBreakdown(
  filteredData: MonthData[],
  category: ExpenseCategory,
): StatementRow[] {
  const keyOf = (l: { supplier: string; description: string }) =>
    `${l.supplier} · ${l.description || "Sin descripción"}`;
  const monthlyMaps: Record<string, number>[] = filteredData.map((m) => {
    const lines = m.expensesDetailByCategory?.[category] ?? [];
    return lines.reduce<Record<string, number>>((acc, l) => {
      const k = keyOf(l);
      acc[k] = (acc[k] ?? 0) + Number(l.amount ?? 0);
      return acc;
    }, {});
  });
  const allKeys = new Set<string>();
  monthlyMaps.forEach((m) => Object.keys(m).forEach((k) => allKeys.add(k)));
  return [...allKeys]
    .sort()
    .map((name) => ({
      label: `      ${name}`,
      values: monthlyMaps.map((m) => m[name] ?? 0),
      total: sumMoney(monthlyMaps.map((m) => m[name] ?? 0)),
      isCost: true,
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
