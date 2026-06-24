import type { ExpenseCategory } from "@/features/accounts-payable";
import { EXPENSE_CATEGORY_LABELS } from "@/features/accounts-payable";
import { roundMoney } from "@/lib/money";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "renta",
  "nomina",
  "servicios_publicos",
  "honorarios",
  "papeleria",
  "capacitacion",
  "publicidad",
  "comisiones_ventas",
  "viajes_representacion",
  "intereses",
  "comisiones_bancarias",
  "caja_chica",
  "otro",
];
export const DIRECT_COST_CATEGORIES: ExpenseCategory[] = [
  "costo_venta",
  "mantenimiento",
  "refacciones",
  "combustible",
  "transporte_logistica",
  "seguros_equipo",
];

export { EXPENSE_CATEGORY_LABELS };
export type { ExpenseCategory };

export interface MonthData {
  monthKey: string;
  month: string;
  revenue: number;
  revenueRental: number;
  revenueSales: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  depreciationByForklift: Record<string, number>;
  rentalByCustomer: Record<string, number>;
  salesByCustomer: Record<string, number>;
  grossProfit: number;
  grossMargin: number;
  expenses: Record<ExpenseCategory, number>;
  totalExpenses: number;
  profitBeforeDepreciation: number;
  marginBeforeDepreciation: number;
  netProfit: number;
  margin: number;
}

export interface StatementRow {
  label: string;
  values: number[];
  total: number;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

export interface YearTotals {
  year: string;
  revenue: number;
  revenueRental: number;
  revenueSales: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  expenses: Record<ExpenseCategory, number>;
  grossProfit: number;
  grossMargin: number;
  totalExpenses: number;
  profitBeforeDepreciation: number;
  marginBeforeDepreciation: number;
  netProfit: number;
  margin: number;
}

export interface ComparisonRow {
  label: string;
  yearValues: number[];
  delta: number;
  deltaPct: number | null;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

export type AccountingBasis = "accrual" | "cash";

export const emptyExpenses = (): Record<ExpenseCategory, number> => ({
  renta: 0, nomina: 0, software: 0, depreciacion: 0,
  otro: 0, costo_venta: 0, caja_chica: 0, publicidad: 0,
});

export function computeDerivedTotals(t: {
  revenue: number;
  maintenanceCost: number;
  damageCost: number;
  depreciation: number;
  expenses: Record<ExpenseCategory, number>;
}) {
  const costoVenta = DIRECT_COST_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
  const grossProfit = roundMoney(t.revenue - t.maintenanceCost - t.damageCost - costoVenta);
  const grossMargin = t.revenue > 0 ? (grossProfit / t.revenue) * 100 : 0;
  const opexTotal = EXPENSE_CATEGORIES.reduce((s, c) => s + t.expenses[c], 0);
  const totalExpenses = roundMoney(t.maintenanceCost + t.damageCost + costoVenta + opexTotal);
  const profitBeforeDepreciation = roundMoney(t.revenue - totalExpenses);
  const marginBeforeDepreciation = t.revenue > 0 ? (profitBeforeDepreciation / t.revenue) * 100 : 0;
  const netProfit = roundMoney(profitBeforeDepreciation - t.depreciation);
  const margin = t.revenue > 0 ? (netProfit / t.revenue) * 100 : 0;
  return { grossProfit, grossMargin, totalExpenses, profitBeforeDepreciation, marginBeforeDepreciation, netProfit, margin };
}
