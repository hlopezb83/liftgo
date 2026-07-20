
import {
  buildStatementRows, buildBreakdownRows, buildCsvRows, buildComparisonValues,
} from "./statementRowFactories";
import {
  type MonthData, type ComparisonRow, type YearTotals,
  DIRECT_COST_CATEGORIES, OPERATING_EXPENSE_GROUPS, EXPENSE_CATEGORY_LABELS,
} from "./types";

interface Totals {
  revenue: number; revenueRentalBooked: number; revenueRentalUnbooked: number; revenueSales: number;
  maintenanceCost: number; damageCost: number; depreciation: number;
  depreciationRented: number; depreciationIdle: number;
  cogsForkliftSales: number;
  expenses: MonthData["expenses"];
  grossProfit: number; grossMargin: number;
  totalExpenses: number;
  profitBeforeDepreciation: number; marginBeforeDepreciation: number;
  netProfit: number; margin: number;
}

export function useStatementRows(filteredData: MonthData[], totals: Totals) {
  const statementRows = buildStatementRows(filteredData, totals);
  const csvRows = buildCsvRows(statementRows, filteredData);
  const depreciationBreakdownRows = buildBreakdownRows(filteredData, (m) => m.depreciationByForklift, true);
  const cogsBreakdownRows = buildBreakdownRows(filteredData, (m) => m.cogsByForklift, true);
  const rentalBookedBreakdownRows = buildBreakdownRows(filteredData, (m) => m.rentalBookedByCustomer);
  const rentalUnbookedBreakdownRows = buildBreakdownRows(filteredData, (m) => m.rentalUnbookedByCustomer);
  const salesBreakdownRows = buildBreakdownRows(filteredData, (m) => m.salesByCustomer);

  return {
    statementRows, csvRows,
    depreciationBreakdownRows, cogsBreakdownRows,
    rentalBookedBreakdownRows, rentalUnbookedBreakdownRows, salesBreakdownRows,
  };
}

export function useComparisonRows(yearTotals: YearTotals[]): ComparisonRow[] {
  if (yearTotals.length < 2) return [];
  const v = (extractor: (yt: YearTotals) => number, opts?: { isCost?: boolean; isSubtotal?: boolean; isPercent?: boolean }) =>
    buildComparisonValues(yearTotals, extractor, opts);
  const groupRows: ComparisonRow[] = [];
  for (const group of OPERATING_EXPENSE_GROUPS) {
    for (const c of group.categories) {
      groupRows.push({
        label: `  (-) ${EXPENSE_CATEGORY_LABELS[c]}`,
        ...v((yt) => yt.expenses[c], { isCost: true }),
      });
    }
    groupRows.push({
      label: `= Total ${group.label}`,
      ...v(
        (yt) => group.categories.reduce((s, c) => s + yt.expenses[c], 0),
        { isSubtotal: true, isCost: true },
      ),
    });
  }
  return [
    { label: "  Ingresos por Rentas (con reserva)", ...v((yt) => yt.revenueRentalBooked) },
    { label: "  Ingresos por Rentas (sin reserva)", ...v((yt) => yt.revenueRentalUnbooked) },
    { label: "  Ingresos por Ventas de Equipo", ...v((yt) => yt.revenueSales) },
    { label: "= Total Ingresos", ...v((yt) => yt.revenue, { isSubtotal: true }) },
    { label: "(-) Mantenimiento", ...v((yt) => yt.maintenanceCost, { isCost: true }) },
    { label: "(-) Daños", ...v((yt) => yt.damageCost, { isCost: true }) },
    ...DIRECT_COST_CATEGORIES.map((c) => ({
      label: `(-) ${EXPENSE_CATEGORY_LABELS[c]}`,
      ...v((yt) => yt.expenses[c], { isCost: true }),
    })),
    { label: "(-) Costo de Equipos Vendidos", ...v((yt) => yt.cogsForkliftSales, { isCost: true }) },
    { label: "= Utilidad Bruta", ...v((yt) => yt.grossProfit, { isSubtotal: true }) },

    { label: "Margen Bruto", ...v((yt) => yt.grossMargin, { isPercent: true }) },
    ...groupRows,
    { label: "= Total Egresos", ...v((yt) => yt.totalExpenses, { isSubtotal: true, isCost: true }) },
    { label: "= Utilidad antes de Depreciación", ...v((yt) => yt.profitBeforeDepreciation, { isSubtotal: true }) },
    { label: "Margen antes de Depreciación", ...v((yt) => yt.marginBeforeDepreciation, { isPercent: true }) },
    { label: "(-) Depreciación (Equipos Rentados)", ...v((yt) => yt.depreciation, { isCost: true }) },
    { label: "= Utilidad Neta", ...v((yt) => yt.netProfit, { isSubtotal: true }) },
    { label: "Margen Neto", ...v((yt) => yt.margin, { isPercent: true }) },
  ];
}

