/**
 * DTOs mínimos que consumen los renderers de `Estado de Resultados` en `lib/pdf`.
 * Se declaran aquí para que `lib/pdf` no dependa de hooks de `features/reports`.
 * Los tipos ricos del hook (con `expenses`, `cogsByForklift`, etc.) siguen viviendo
 * en `features/reports/hooks/incomeStatement/types` y son estructuralmente
 * compatibles con estos DTOs, así que los consumidores pueden pasarlos tal cual.
 */
export interface PdfMonthData {
  month: string;
}

export interface PdfStatementRow {
  label: string;
  values: number[];
  total: number;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

export interface PdfComparisonRow {
  label: string;
  yearValues: number[];
  delta: number;
  deltaPct: number | null;
  isSubtotal?: boolean;
  isCost?: boolean;
  isPercent?: boolean;
}

export interface PdfYearTotals {
  year: string;
}
