/**
 * Query key factories para la feature `reports`.
 */
import { createEntityKeys } from "@/lib/query/createEntityKeys";

export const incomeStatementKeys = createEntityKeys("income_statement");

/**
 * Prefijo raíz de las queries agregadas de reportes (`["report", ...]`:
 * useRevenueByMonthReport, useUtilizationReportData, useMaintenanceCostByUnitReport,
 * useProfitByModelReport). FIX-R2-03 (N10): las mutaciones de invoices, bookings y
 * maintenance_logs deben invalidar `reportKeys.all` para refrescar las cifras.
 */
const baseReportKeys = createEntityKeys("report");

export const reportKeys = {
  ...baseReportKeys,
  utilizationByUnit: (start: string, end: string) => [...baseReportKeys.all, "utilization-by-unit", start, end] as const,
  utilizationByModel: (start: string, end: string) => [...baseReportKeys.all, "utilization-by-model", start, end] as const,
  profitByModel: (start: string, end: string) => [...baseReportKeys.all, "profit-by-model", start, end] as const,
  revenueByMonth: (start: string, end: string) => [...baseReportKeys.all, "revenue-by-month", start, end] as const,
  revenueMonthInvoices: (monthKey: string | null) => [...baseReportKeys.all, "revenue-month-invoices", monthKey] as const,
  maintenanceCostByUnit: (start: string, end: string) => [...baseReportKeys.all, "maintenance-cost-by-unit", start, end] as const,
} as const;
