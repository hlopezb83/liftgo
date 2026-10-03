import type { ErrorCode } from "@/lib/domain/errorCatalog";
import { extractErrorDetails } from "@/lib/ui/errorDetailsExtract";
import { redactPII } from "./scrubPII";
import { Sentry } from "./sentry";

interface ErrorContext { phase?: string; errorCode?: ErrorCode; severity?: "critical" | "warning" }
const ACTIONABLE = new Set<ErrorCode>(["INTERNAL_ERROR", "NETWORK_ERROR", "DB_PERMISSION_DENIED", "CFDI_FACTURAPI_ERROR", "UNKNOWN"]);
const seen = new WeakSet<object>();
const EXPECTED_STATUS = new Set([401, 403, 404, 409, 422, 429]);

/** Sólo incidentes técnicos; el reporte completo/PII copiable sigue siendo local. */
export function captureOperationalError(error: unknown, context: ErrorContext): void {
  if (typeof window === "undefined" || !Sentry.getClient() || context.severity === "warning" || !ACTIONABLE.has(context.errorCode ?? "UNKNOWN")) return;
  if (error && typeof error === "object") {
    if (seen.has(error)) return;
    seen.add(error);
  }
  const detail = extractErrorDetails(error);
  if (detail.validationErrors?.length || EXPECTED_STATUS.has(detail.status ?? 0)) return;
  // No pasar objetos del backend, variables de mutación ni cuerpos HTTP al SDK.
  const incident = new Error(redactPII(detail.message));
  incident.name = detail.name ?? "OperationalError";
  if (detail.stack) incident.stack = redactPII(detail.stack);
  Sentry.withScope((scope) => {
    scope.setTag("phase", context.phase ?? "operation");
    scope.setTag("errorCode", context.errorCode ?? "UNKNOWN");
    scope.setContext("operation", { status: detail.status, code: detail.code });
    Sentry.captureException(incident);
  });
}
