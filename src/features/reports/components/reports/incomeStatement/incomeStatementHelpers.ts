import { formatCurrency } from "@/lib/format/formatCurrency";
import type { StatementRow, ComparisonRow } from "@/features/reports/hooks/useIncomeStatementData";

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

export function getBreakdownFor(label: string, depRows: BreakdownRow[], rentalRows: BreakdownRow[], salesRows: BreakdownRow[]) {
  if (label === "(-) Depreciación (Equipos Rentados)") return { rows: depRows, key: "dep" as const };
  if (label === "  Ingresos por Rentas") return { rows: rentalRows, key: "rental" as const };
  if (label === "  Ingresos por Ventas") return { rows: salesRows, key: "sales" as const };
  return null;
}
