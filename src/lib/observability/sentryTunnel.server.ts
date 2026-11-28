import { PUBLIC_SENTRY_DSN } from "./privacyOptions";

export const SENTRY_TUNNEL_PATH = "/api/sentry-tunnel";
export const SENTRY_TUNNEL_MAX_BYTES = 256 * 1024;
const MAX_HEADER_BYTES = 8 * 1024;

interface ParsedDsn {
  origin: string;
  projectId: string;
}

export function parseAllowedSentryDsn(rawDsn: string | undefined): ParsedDsn | null {
  if (!rawDsn) return null;
  try {
    const url = new URL(rawDsn);
    if (url.protocol !== "https:") return null;
    const projectId = url.pathname.replace(/^\/+/, "").split("/")[0];
    if (!projectId || !/^\d{1,32}$/.test(projectId)) return null;
    return { origin: url.origin, projectId };
  } catch {
    return null;
  }
}

export function resolveAllowedServerDsn(env: unknown): string {
  const bindings = env && typeof env === "object" ? (env as Record<string, unknown>) : {};
  if (typeof bindings.SENTRY_DSN === "string") return bindings.SENTRY_DSN;
  return process.env.SENTRY_DSN ?? import.meta.env.VITE_SENTRY_DSN ?? PUBLIC_SENTRY_DSN;
}

function readEnvelopeHeaderDsn(body: Uint8Array): string | null {
  const limit = Math.min(body.byteLength, MAX_HEADER_BYTES);
  let newlineIndex = body.indexOf(10);
  if (newlineIndex === -1) newlineIndex = body.byteLength;
  if (newlineIndex === 0 || newlineIndex > limit) return null;
  try {
    const headerText = new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(0, newlineIndex));
    const parsed = JSON.parse(headerText) as { dsn?: unknown };
    return typeof parsed?.dsn === "string" ? parsed.dsn : null;
  } catch {
    return null;
  }
}

async function readValidatedEnvelopeBody(request: Request): Promise<Uint8Array | Response> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (!Number.isFinite(length) || length < 0) return new Response(null, { status: 400 });
    if (length > SENTRY_TUNNEL_MAX_BYTES) return new Response(null, { status: 413 });
  }
  let body: Uint8Array;
  try {
    body = new Uint8Array(await request.arrayBuffer());
  } catch {
    return new Response(null, { status: 400 });
  }
  if (body.byteLength === 0) return new Response(null, { status: 400 });
  if (body.byteLength > SENTRY_TUNNEL_MAX_BYTES) return new Response(null, { status: 413 });
  return body;
}

/**
 * Túnel anti-adblocker endurecido contra SSRF para sobres de Sentry del navegador.
 * Sólo acepta POST <= 256 KiB cuyo sobre apunte exactamente al host y projectId
 * del DSN permitido, sin reenviar cookies ni cabeceras del cliente.
 */
export async function handleSentryTunnel(
  request: Request,
  allowedDsn: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }
  const allowed = parseAllowedSentryDsn(allowedDsn);
  if (!allowed) return new Response(null, { status: 503 });

  const body = await readValidatedEnvelopeBody(request);
  if (body instanceof Response) return body;

  const envelopeDsn = parseAllowedSentryDsn(readEnvelopeHeaderDsn(body) ?? undefined);
  if (!envelopeDsn) return new Response(null, { status: 400 });
  if (envelopeDsn.origin !== allowed.origin || envelopeDsn.projectId !== allowed.projectId) {
    return new Response(null, { status: 403 });
  }

  const upstreamUrl = `${allowed.origin}/api/${allowed.projectId}/envelope/`;
  try {
    const upstream = await fetchImpl(upstreamUrl, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body: body as unknown as BodyInit,
    });
    return new Response(null, { status: upstream.status });
  } catch {
    return new Response(null, { status: 502 });
  }
}
