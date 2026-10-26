import type { ErrorCode } from "@/lib/domain/errorCatalog";
import { extractErrorDetails } from "@/lib/ui/errorDetailsExtract";
import { databasePrivilegeIncident, databasePrivilegeTarget } from "./databasePrivilegeFailure";
import { redactPII } from "./scrubPII";
import { Sentry } from "./sentry";

interface ErrorContext { phase?: string; errorCode?: ErrorCode; severity?: "critical" | "warning" }
const ACTIONABLE = new Set<ErrorCode>(["INTERNAL_ERROR", "NETWORK_ERROR", "DB_PERMISSION_DENIED", "CFDI_FACTURAPI_ERROR", "UNKNOWN"]);
const seen = new WeakSet<object>();
const EXPECTED_STATUS = new Set([401, 404, 409, 422, 429]);

function operationalIncident(error: unknown) {
  const detail = extractErrorDetails(error);
  const privilegeTarget = databasePrivilegeTarget(detail);
  if (detail.validationErrors?.length || EXPECTED_STATUS.has(detail.status ?? 0)
    || (detail.status === 403 && !privilegeTarget)) return;
  if (privilegeTarget) return { incident: databasePrivilegeIncident(privilegeTarget), status: detail.status, code: "42501" };
  // No pasar objetos del backend, variables de mutación ni cuerpos HTTP al SDK.
  const incident = new Error(redactPII(detail.message));
  incident.name = detail.name ?? "OperationalError";
  if (detail.stack) incident.stack = redactPII(detail.stack);
  return { incident, status: detail.status, code: detail.code };
}

/** El navegador reporta el equipo sin internet: el fallo es del dispositivo, no de LiftGO. */
function deviceOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/** Sólo incidentes técnicos; el reporte completo/PII copiable sigue siendo local. */
export function captureOperationalError(error: unknown, context: ErrorContext): void {
  if (typeof window === "undefined" || context.severity === "warning" || !ACTIONABLE.has(context.errorCode ?? "UNKNOWN")) return;
  if (context.errorCode === "NETWORK_ERROR" && deviceOffline()) return;
  try {
    if (!Sentry.getClient() || (error && typeof error === "object" && seen.has(error))) return;
    const report = operationalIncident(error);
    if (!report) return;
    Sentry.withScope((scope) => {
      scope.setTag("phase", context.phase ?? "operation");
      scope.setTag("errorCode", context.errorCode ?? "UNKNOWN");
      scope.setContext("operation", { status: report.status, code: report.code });
      Sentry.captureException(report.incident);
    });
    if (error && typeof error === "object") seen.add(error);
  } catch { /* El fallo del monitoreo no oculta el toast ni su diagnóstico JSON. */ }
}
