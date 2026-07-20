import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "@/features/reports/hooks/incomeStatement/types";
import { formatCurrency } from "@/lib/format/formatCurrency";
import type { StatementRow, ComparisonRow } from "../../../hooks/useIncomeStatementData";

export interface BreakdownRow { label: string; values: number[]; total: number }

export const formatCell = (row: StatementRow | ComparisonRow, value: number) =>
  row.isPercent ? `${value.toFixed(1)}%` : formatCurrency(value);

export function formatRowDelta(row: ComparisonRow): string {
  const sign = row.delta >= 0 ? "+" : "";
  if (row.isPercent) return `${sign}${row.delta.toFixed(1)} pp`;
  return `${sign}${formatCurrency(row.delta)}`;
}

export const cellColor = (row: StatementRow | ComparisonRow, value: number) => {
  if (row.isCost || value < 0) return "text-destructive";
  return "";
};

// PL-05: reverse map "label" → ExpenseCategory to expand by-category drill-down.
const EXPENSE_LABEL_TO_CAT: Record<string, ExpenseCategory> = Object.entries(
  EXPENSE_CATEGORY_LABELS,
).reduce<Record<string, ExpenseCategory>>((acc, [cat, label]) => {
  acc[label.toLowerCase()] = cat as ExpenseCategory;
  return acc;
}, {});

function resolveExpenseCategory(label: string): ExpenseCategory | null {
  const m = label.trim().match(/^\(-\)\s+(.+)$/);
  if (!m) return null;
  return EXPENSE_LABEL_TO_CAT[m[1].trim().toLowerCase()] ?? null;
}

export function getBreakdownFor(
  label: string,
  depRows: BreakdownRow[],
  cogsRows: BreakdownRow[],
  rentalBookedRows: BreakdownRow[],
  rentalUnbookedRows: BreakdownRow[],
  salesRows: BreakdownRow[],
  damageRecoveryRows: BreakdownRow[] = [],
  expenseDetailByCategory: Record<string, BreakdownRow[]> = {},
) {
  if (label === "(-) Depreciación (Equipos Rentados)") return { rows: depRows, key: "dep" as const };
  if (label === "(-) Costo de Equipos Vendidos") return { rows: cogsRows, key: "cogs" as const };
  if (label === "  Ingresos por Rentas (con reserva)") return { rows: rentalBookedRows, key: "rentalBooked" as const };
  if (label === "  Ingresos por Rentas (sin reserva)") return { rows: rentalUnbookedRows, key: "rentalUnbooked" as const };
  if (label === "  Ingresos por Ventas de Equipo") return { rows: salesRows, key: "sales" as const };
  if (label === "  Recuperación de Daños") return { rows: damageRecoveryRows, key: "damageRecovery" as const };
  const cat = resolveExpenseCategory(label);
  if (cat && expenseDetailByCategory[cat]) {
    return { rows: expenseDetailByCategory[cat], key: `exp:${cat}` as const };
  }
  return null;
}
