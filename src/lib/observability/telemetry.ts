/**
 * Telemetría ligera. Hoy: console.* solo en DEV.
 * Mañana: conectar a Sentry / tabla `function_logs` cambiando esta única implementación.
 */

type Level = "info" | "warn" | "error";

interface LogPayload {
  level: Level;
  scope: string;
  message: string;
  meta?: Record<string, unknown>;
}

function emit({ level, scope, message, meta }: LogPayload) {
  if (!import.meta.env.DEV) return; // placeholder hasta conectar backend de telemetría
  const tag = `[${scope}]`;
  // eslint-disable-next-line no-console
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  if (meta) fn(tag, message, meta);
  else fn(tag, message);
}

export const telemetry = {
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit({ level: "info", scope, message, meta }),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit({ level: "warn", scope, message, meta }),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit({ level: "error", scope, message, meta }),
};
