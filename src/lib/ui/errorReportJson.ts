import type { ErrorReport } from "./errorReport";

const REDACTED = "[REDACTADO]";
const SECRET_KEY = /^(?:.*(?:password|contrase[nñ]a|secret|token|api[_-]?key)|authorization|cookie|set-cookie)$/i;

/** Keep useful fiscal identifiers; exclude credentials from a copyable diagnostic. */
export function redactDiagnosticText(value: string): string {
  return value
    .replace(/\bsk_(?:test|live)_[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\bBearer\s+[^\s"'<>]+/gi, `Bearer ${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/((?:password|contrase[nñ]a|api[_-]?key|access_token|refresh_token|token|secret|authorization)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, `$1${REDACTED}`);
}

/** Snapshot unknown context without throwing on cycles, BigInt or accessors. */
export function diagnosticSnapshot(value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (typeof value === "string") return redactDiagnosticText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) return "[Referencia circular]";
  if (depth >= 12) return "[Profundidad limitada]";
  const next = new Set(ancestors).add(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Fecha inválida" : value.toISOString();
  if (Array.isArray(value)) return value.map((item) => diagnosticSnapshot(item, next, depth + 1));
  return snapshotObject(value, next, depth);
}

function snapshotObject(value: object, ancestors: Set<object>, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue;
    result[key] = SECRET_KEY.test(key) ? REDACTED : "value" in descriptor
      ? diagnosticSnapshot(descriptor.value, ancestors, depth + 1) : "[Propiedad calculada]";
  }
  return result;
}

export function formatReportJson(report: ErrorReport): string {
  return JSON.stringify(diagnosticSnapshot(report), null, 2);
}
