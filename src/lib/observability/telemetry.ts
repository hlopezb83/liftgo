/**
 * Telemetría ligera: console.* en DEV; en producción enruta `warn` como
 * breadcrumb saneado de Sentry y `error` a `captureOperationalError`.
 */
import { captureOperationalError } from "./captureOperationalError";
import { redactPII, scrubData } from "./scrubPII";
import { Sentry } from "./sentry";

type Level = "info" | "warn" | "error";

interface LogPayload {
  level: Level;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

function emit({ level, scope, message, meta }: LogPayload) {
  if (import.meta.env.DEV) {
    const tag = `[${scope}]`;
    // eslint-disable-next-line no-console
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
    if (meta) fn(tag, message, meta);
    else fn(tag, message);
    return;
  }
  if (typeof window === "undefined") return;
  try {
    if (level === "warn" && Sentry.getClient()) {
      Sentry.addBreadcrumb({
        category: `telemetry.${scope}`,
        level: "warning",
        message: redactPII(message),
        data: meta ? (scrubData(meta) as Record<string, unknown>) : undefined,
      });
    } else if (level === "error") {
      captureOperationalError(new Error(`[${scope}] ${redactPII(message)}`), {
        phase: scope,
        errorCode: "INTERNAL_ERROR",
      });
    }
  } catch { /* La telemetría nunca interrumpe el flujo de negocio. */ }
}

export const telemetry = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit({ level: "info", scope, message, meta }),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit({ level: "warn", scope, message, meta }),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit({ level: "error", scope, message, meta }),
};
