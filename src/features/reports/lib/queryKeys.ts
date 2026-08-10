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
export const reportKeys = createEntityKeys("report");
