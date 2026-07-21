// Sanitiza payloads antes de enviarlos a Sentry.
//
// Doble red de seguridad: aunque Session Replay ya enmascara texto/inputs y no
// captura bodies de red, los `exception.value`, `message`, `breadcrumb.message`
// y `request.url` viajan como strings crudos. En LiftGo esos strings suelen
// llevar folios (FAC-XXXX), RFC/CURP, correos de cliente y JWTs si un error
// escapa con la URL completa. Este módulo los redacta antes de `beforeSend` /
// `beforeBreadcrumb`.
//
// Exportado como funciones puras para poder ejercitarlo desde vitest sin
// inicializar Sentry.

const REDACTED = "[REDACTED]";

// Patrones acotados: la idea NO es hacer NLP, sólo cubrir los identificadores
// mexicanos que aparecen en logs del ERP + secretos comunes.
const PII_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // Email
  { name: "email", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // RFC MX persona moral (12) o física (13): 3-4 letras + 6 dígitos + 3 alfanum
  { name: "rfc", re: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g },
  // CURP: 18 alfanuméricos con estructura fija (letra+vocal+letra+letra+6dig+H|M+2let+3let+alfanum+dig)
  { name: "curp", re: /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d\b/g },
  // JWT (aa.bb.cc). Suficientemente largo para no chocar con versiones semver.
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  // Bearer tokens sueltos en mensajes.
  { name: "bearer", re: /Bearer\s+[A-Za-z0-9._-]+/gi },
  // Teléfono MX (10 dígitos, opcional +52 y separadores).
  { name: "phone", re: /(?:\+?52[\s-]?)?(?:\d[\s-]?){10}\d?/g },
];

// Params de query que suelen llevar secretos o PII directa. Se redactan valores;
// las claves quedan visibles para poder correlacionar en Sentry.
const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "apikey",
  "api_key",
  "key",
  "secret",
  "password",
  "email",
  "phone",
  "rfc",
  "curp",
]);

export function redactPII(input: string | undefined | null): string {
  if (!input) return "";
  let out = input;
  for (const { re } of PII_PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

export function scrubUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl) return "";
  try {
    // Base dummy para URLs relativas (p.ej. /portal/statement?token=...).
    const url = new URL(rawUrl, "https://redacted.local");
    let mutated = false;
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        url.searchParams.set(key, REDACTED);
        mutated = true;
      } else {
        // Valores no sensibles: sólo redactar si contienen PII detectable.
        const val = url.searchParams.get(key) ?? "";
        const scrubbed = redactPII(val);
        if (scrubbed !== val) {
          url.searchParams.set(key, scrubbed);
          mutated = true;
        }
      }
    }
    // También redactar el path (folios/emails embebidos, ej. /clientes/juan@x.com).
    const scrubbedPath = redactPII(url.pathname);
    if (scrubbedPath !== url.pathname) {
      url.pathname = scrubbedPath;
      mutated = true;
    }
    if (!mutated && rawUrl.startsWith("/")) return url.pathname + url.search;
    return url.pathname + url.search + url.hash;
  } catch {
    return redactPII(rawUrl);
  }
}

// Estructura mínima compatible con Sentry.Event; usamos `unknown` en `user.id`
// porque Sentry lo tipa como `string | number`. Mantener este módulo sin
// import type desde @sentry/* facilita el test unitario.
interface ScrubbableEvent {
  message?: string;
  request?: { url?: string; query_string?: unknown; cookies?: unknown; headers?: Record<string, unknown> };
  exception?: { values?: Array<{ value?: string }> };
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown> }>;
  contexts?: Record<string, Record<string, unknown> | undefined>;
  extra?: Record<string, unknown>;
  user?: { id?: unknown; email?: string; username?: string; ip_address?: string } | null;
}

export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.message) event.message = redactPII(event.message);

  if (event.request) {
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
    // Cookies y query_string siempre van al basurero: son PII/tokens por definición.
    if (event.request.query_string) event.request.query_string = REDACTED;
    if (event.request.cookies) event.request.cookies = REDACTED;
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, unknown>;
      for (const k of Object.keys(headers)) {
        if (/^(authorization|cookie|x-api-key)$/i.test(k)) headers[k] = REDACTED;
      }
    }
  }

  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (v.value) v.value = redactPII(v.value);
    }
  }

  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.message) b.message = redactPII(b.message);
      if (b.data && typeof b.data === "object") {
        const data = b.data as Record<string, unknown>;
        if (typeof data.url === "string") data.url = scrubUrl(data.url);
        if (typeof data.to === "string") data.to = scrubUrl(data.to);
        if (typeof data.from === "string") data.from = scrubUrl(data.from);
      }
    }
  }

  // Nunca mandar email/username/ip aunque un caller haya seteado setUser con
  // esos campos. Sólo el id sobrevive para correlacionar.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}
