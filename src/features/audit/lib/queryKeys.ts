/**
 * Fachada pública del módulo Auditoría.
 *
 * Los contratos viven en `auditQueryContracts.ts`, los fetchers de la bitácora
 * en `auditLogQueries.ts` y las métricas en `activityMetricsQueries.ts`.
 * Este archivo sólo reexporta para conservar el mismo path de importación.
 */
export {
  auditKeys,
  readAuditLogFilters,
  buildLabel,
} from "./auditQueryContracts";
export type {
  AuditLog,
  AuditOrigin,
  AuditLogFilters,
  LabelProjectionRow,
} from "./auditQueryContracts";

export { auditLogsQueries, auditLogDetailQueries } from "./auditLogQueries";

export { activityMetricsQueries } from "./activityMetricsQueries";
