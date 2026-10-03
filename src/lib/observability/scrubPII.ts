import { sanitizeRoute } from "./routeContext";

const REDACTED = "[REDACTED]";
const PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g,
  /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /Bearer\s+[^\s"',;]+/gi,
  /\bsk_(?:test|live|user)_[A-Za-z0-9_-]+/g,
  /(?<![A-Za-z0-9])(?:\+?52[\s-]?)?(?:\d[\s-]?){9}\d(?![A-Za-z0-9])/g,
];
const SENSITIVE_KEY = /^(?:authorization|proxyauthorization|cookies?|setcookie|xapikey|apikey|key|secret|clientsecret|password|passwd|pwd|token|accesstoken|refreshtoken|idtoken|email|phone|telephone|rfc|curp|querystring|body|requestbody|responsebody|variables|formdata)$/i;
const URL_KEY = /(?:urls?|uri|href|filename|abs_path|path|pathname)$|^(?:to|from|url\..*|http\.target)$/i;

export function redactPII(input: string | undefined | null): string {
  let out = input ?? "";
  for (const pattern of PATTERNS) out = out.replace(pattern, REDACTED);
  return out.replace(/\b((?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token)["']?\s*[:=]\s*)["']?[^\s&,;"'}]+["']?/gi, `$1${REDACTED}`);
}

/** Conserva la ruta para diagnóstico, elimina todos los filtros y fragmentos. */
export function scrubUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl, "https://redacted.local");
    if (url.protocol !== "http:" && url.protocol !== "https:") return REDACTED;
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch { /* ruta malformada: redactar lo legible */ }
    return redactPII(sanitizeRoute(path));
  } catch {
    return redactPII(rawUrl.split(/[?#]/, 1)[0]);
  }
}

/** Copia acotada: no ejecuta getters ni serializa objetos cíclicos o cuerpos. */
export function scrubData(value: unknown, key = "", depth = 0, seen = new WeakSet<object>()): unknown {
  if (SENSITIVE_KEY.test(key.replace(/[^a-z]/gi, ""))) return REDACTED;
  if (typeof value === "string") return scrubString(value, key);
  if (value === null) return null;
  if (typeof value !== "object") return typeof value === "number" || typeof value === "boolean" ? value : undefined;
  if (depth >= 8 || seen.has(value)) return REDACTED;
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrubData(item, key, depth + 1, seen));
  return scrubObject(value, depth, seen);
}

function scrubString(value: string, key: string): string {
  if (/^(?:event_id|trace_id|span_id|parent_span_id|debug_id|organization_id|tenant)$/.test(key)
    && /^(?:[0-9a-f]{16,32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value)) return value;
  if (!URL_KEY.test(key)) return redactPII(value);
  const path = scrubUrl(value);
  // Mantener origen de los scripts para que Sentry pueda resolver sourcemaps.
  if (key === "filename" || key === "abs_path") {
    try { const url = new URL(value); return url.origin + path; } catch { /* ruta relativa */ }
  }
  return path;
}

function scrubObject(value: object, depth: number, seen: WeakSet<object>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value)).slice(0, 100)) {
    if (name === "__proto__" || name === "constructor" || name === "prototype") continue;
    output[name] = "value" in descriptor ? scrubData(descriptor.value, name, depth + 1, seen) : REDACTED;
  }
  return output;
}

interface ScrubbableEvent {
  message?: string;
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: Record<string, unknown>; data?: unknown };
  exception?: { values?: Array<{ value?: string; stacktrace?: unknown }> };
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  user?: { id?: unknown; email?: string | null; username?: string | null; ip_address?: string | null } | null;
}

export function scrubEvent<T extends Partial<ScrubbableEvent>>(event: T): T {
  const clean = scrubData(event) as T;
  if (clean.request?.data !== undefined) clean.request.data = REDACTED;
  if (event.user) clean.user = { id: typeof event.user.id === "string" || typeof event.user.id === "number" ? event.user.id : undefined };
  return clean;
}

/** Sentry 11 envía spans fuera de beforeSend: filtrar cada span en stream mode. */
export function scrubSpan<T extends { name: string; attributes: Record<string, unknown> }>(span: T): T {
  const attributes = scrubData(span.attributes) as T["attributes"];
  for (const key of Object.keys(attributes)) {
    if (/^(?:params\.|url\.path\.parameter\.|http\.(?:request|response)\.(?:header|body)|db\.query\.parameter)/.test(key)) delete attributes[key];
  }
  return { ...span, name: redactPII(sanitizeRoute(span.name)), attributes };
}
