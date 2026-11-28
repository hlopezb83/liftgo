// Barrel público de la feature "audit".
// Re-exporta la API consumida por otras features.
// Generado automáticamente; ampliar manualmente si hace falta.
export { AuditLogDetailDialog } from "./components/auditTrail/AuditLogDetailDialog";
export {
  formatAuditValue,
  formatTimestamp,
  HIDDEN_DIFF_FIELDS,
  translateAction,
  translateField,
} from "./components/auditTrail/auditTrailConstants";
export { type AuditLog, useAuditLogs } from "./hooks/useAuditLogs";
