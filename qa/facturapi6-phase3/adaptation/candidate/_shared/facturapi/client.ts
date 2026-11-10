// Wrapper centralizado del SDK oficial de Facturapi.
// El SDK usa globalThis.fetch internamente, por lo que sigue siendo
// interceptable por los mocks de tests existentes (facturapiMock.ts).
//
// Ventajas vs fetch directo:
// - Auth y serialización gestionadas por el SDK.
// - Errores tipados (`FacturapiError` con .status, .code, .message).
// - Mantenido oficialmente por Facturapi (v6.0.0).
//
// deno-lint-ignore-file no-explicit-any
import * as FacturapiPkg from "facturapi6-preview";
import { readQaTestConfig, QaConfigError } from "../../../testConfig.ts";

// El SDK se publica como módulo dual ESM/CJS. La interop de Deno expone la
// clase como `default.default` (CJS) o `default` (ESM), así que resolvemos
// ambos casos de forma defensiva.
const pkgAny = FacturapiPkg as any;
const Facturapi = (pkgAny.default?.default ?? pkgAny.default ?? pkgAny) as new (
  apiKey: string,
  options?: Record<string, unknown>,
) => any;
const FacturapiError = pkgAny.FacturapiError ??
  pkgAny.default?.FacturapiError ??
  pkgAny.default?.default?.FacturapiError ??
  class FacturapiError extends Error {};

export { Facturapi, FacturapiError };

export type FacturapiClient = any;

export type FacturapiMode = "test" | "live";

export interface ResolveKeyInput {
  mode: FacturapiMode;
  dbTestKey?: string | null;
  dbLiveKey?: string | null;
  envTestKey?: string | null | undefined;
  envLiveKey?: string | null | undefined;
}

/**
 * Resuelve la API key según modo, priorizando BD sobre env (mantiene
 * el comportamiento previo a la migración al SDK).
 */
export function resolveFacturapiKey(input: ResolveKeyInput): string | null {
  const { mode, dbTestKey, dbLiveKey, envTestKey, envLiveKey } = input;
  const key = mode === "live"
    ? (dbLiveKey || envLiveKey || null)
    : (dbTestKey || envTestKey || null);
  return key && key.length > 0 ? key : null;
}

export interface FacturapiConfig {
  mode: FacturapiMode;
  apiKey: string | null;
}

/**
 * Lee `company_settings.facturapi_mode` + `billing_secrets` y resuelve la
 * API key para el modo activo. Concentra el boilerplate repetido en
 * stamp-*, cancel-*, download-cfdi, refresh-cancellation-status, etc.
 *
 * `modeOverride` evita una segunda lectura de `company_settings` cuando el
 * handler ya obtuvo el modo (p. ej. porque necesita otros campos).
 */

export interface OrgFacturapiConfig extends FacturapiConfig {
  organizationId: string;
  /** true cuando la key vino de variables de entorno (compat legado). */
  fromEnvFallback: boolean;
}

export type FacturapiConfigErrorCode =
  | "config_read_error"
  | "config_missing"
  | "config_invalid_mode"
  | "config_invalid_key_mode"
  | "config_duplicate_key"
  | "organization_required";

/**
 * Error explícito de configuración fiscal. NUNCA debe traducirse a un
 * timbrado stub ni a "modo test": significa que no sabemos con qué empresa
 * ni con qué modo operar.
 */
export class FacturapiConfigError extends Error {
  readonly code: FacturapiConfigErrorCode;
  readonly organizationId: string | null;
  constructor(
    code: FacturapiConfigErrorCode,
    message: string,
    organizationId: string | null,
  ) {
    super(message);
    this.name = "FacturapiConfigError";
    this.code = code;
    this.organizationId = organizationId;
  }
}

export function isFacturapiConfigError(
  err: unknown,
): err is FacturapiConfigError {
  return err instanceof FacturapiConfigError;
}

/** La llave determina el ambiente real del proveedor, no el modo del ERP. */
function assertFacturapiKeyMode(
  apiKey: string,
  mode: FacturapiMode,
  organizationId: string,
): void {
  const prefix = mode === "test" ? "sk_test_" : "sk_live_";
  if (!apiKey.startsWith(prefix) || apiKey.length <= prefix.length) {
    throw new FacturapiConfigError(
      "config_invalid_key_mode",
      "La llave de Facturapi no corresponde al ambiente de esta empresa. " +
        "Revisa su configuración fiscal antes de operar.",
      organizationId,
    );
  }
}

/**
 * Multiempresa · Fase 1. Resuelve modo + API key SIEMPRE acotados a la
 * organización del documento. Nunca usa `limit(1)` "a ciegas".
 *
 * POLÍTICA DE CONFIGURACIÓN (v8.8.7):
 *  - Error de lectura en `company_settings`, `billing_secrets` u
 *    `organizations` ⇒ `FacturapiConfigError("config_read_error")`. No se
 *    devuelve llave ni se recurre al entorno: un fallo transitorio de BD no
 *    puede degradarse a "modo test".
 *  - Configuración ausente (sin fila de `company_settings` para la empresa o
 *    `facturapi_mode` nulo) ⇒ `FacturapiConfigError("config_missing")`.
 *    Ausencia NO equivale a modo test explícito.
 *  - `facturapi_mode` distinto de 'test'/'live' (o `modeOverride` inválido)
 *    ⇒ `FacturapiConfigError("config_invalid_mode")`.
 *  - `modeOverride: null` se interpreta como configuración ausente; los
 *    handlers que ya leyeron `company_settings` deben propagar su error de
 *    lectura en vez de pasar `null`.
 *  - Sin credenciales en `billing_secrets` (y sin fallback legado aplicable)
 *    se devuelve `apiKey: null` con el modo real, para que cada handler
 *    libere su claim y responda un error propio sin emitir CFDI.
 *
 * Compatibilidad transitoria: las llaves globales de entorno
 * (FACTURAPI_TEST_KEY / FACTURAPI_LIVE_KEY) sólo se aceptan mientras exista
 * UNA sola organización en la base y sea exactamente la solicitada. En cuanto
 * se dé de alta una segunda empresa el fallback deja de aplicar por sí solo.
 * Para retirarlo: cargar las llaves de la empresa actual en `billing_secrets`
 * y borrar los secretos FACTURAPI_*_KEY del entorno de las funciones.
 */
export async function getFacturapiConfigForOrganization(input: {
  admin: { from: (table: string) => any };
  env: (key: string) => string | undefined;
  organizationId: string | null | undefined;
  modeOverride?: string | null | undefined;
}): Promise<OrgFacturapiConfig> {
  try {
    return await readQaTestConfig(input);
  } catch (error) {
    if (error instanceof QaConfigError) {
      throw new FacturapiConfigError(error.code, error.message, input.organizationId ?? null);
    }
    throw error;
  }
}

/**
 * true sólo si existe exactamente una organización y es la solicitada.
 * Fail-closed ante errores de consulta.
 */
export type FacturapiConfigOutcome =
  | { ok: true; apiKey: string | null; mode: FacturapiMode }
  | {
    ok: false;
    code: FacturapiConfigErrorCode;
    message: string;
    status: number;
  };

/**
 * 8.8.7: variante sin excepciones de `getFacturapiConfigForOrganization`,
 * para handlers que deben LIBERAR su claim antes de responder. Un error de
 * lectura devuelve 503 (transitorio); ausencia/modo inválido devuelve 400.
 * Nunca devuelve una llave de otra empresa ni degrada a modo test.
 */
export async function loadFacturapiConfigOutcome(input: {
  admin: { from: (table: string) => any };
  env: (key: string) => string | undefined;
  organizationId: string | null | undefined;
  modeOverride?: string | null | undefined;
}): Promise<FacturapiConfigOutcome> {
  try {
    const cfg = await getFacturapiConfigForOrganization(input);
    return { ok: true, apiKey: cfg.apiKey, mode: cfg.mode };
  } catch (err) {
    if (isFacturapiConfigError(err)) {
      return {
        ok: false,
        code: err.code,
        message: err.message,
        status: err.code === "config_read_error" ? 503 : 400,
      };
    }
    throw err;
  }
}

export async function isSoleLegacyOrganization(
  admin: { from: (table: string) => any },
  organizationId: string,
): Promise<boolean> {
  const res = await admin.from("organizations").select("id").limit(2);
  if ((res as { error?: unknown })?.error) return false;
  const rows = ((res as { data?: unknown })?.data ?? []) as Array<
    { id?: string }
  >;
  return rows.length === 1 && rows[0]?.id === organizationId;
}

/**
 * 8.8.8: variante ESTRICTA usada por el resolver de configuración fiscal.
 * Un error al leer `organizations` NO se degrada a "no aplica el fallback":
 * se propaga como FacturapiConfigError(config_read_error) para que el handler
 * libere su claim y responda 503, sin llave, sin entorno y sin timbrado stub.
 */
export async function readSoleLegacyOrganizationStrict(
  admin: { from: (table: string) => any },
  organizationId: string,
): Promise<boolean> {
  const res = await admin.from("organizations").select("id").limit(2);
  if ((res as { error?: unknown })?.error) {
    throw new FacturapiConfigError(
      "config_read_error",
      "No se pudo verificar la empresa para resolver la configuración fiscal. Reintenta en unos segundos.",
      organizationId,
    );
  }
  const rows = ((res as { data?: unknown })?.data ?? []) as Array<
    { id?: string }
  >;
  return rows.length === 1 && rows[0]?.id === organizationId;
}

/** Crea una instancia del SDK con la API key resuelta. */
export function createFacturapiClient(apiKey: string): FacturapiClient {
  void apiKey;
  // SDK 6 no ofrece fetch por instancia: no conectar hasta revisar transporte.
  throw new Error("QA_TRANSPORT_BLOCKED");
}

/**
 * The v6 resource methods supply their own date conversion plan, HTTP method,
 * encoded path and query parameters. Call those methods instead of rebuilding
 * their requests or depending on the removed get/put/delete transport helpers.
 *
 * AbortSignal is still forwarded by request() to fetch. Give each call its own
 * resource/transport view so concurrent requests never overwrite a shared
 * signal, and SDK response timestamps keep the same Date contract as direct
 * resource calls. Never silently fall back to a non-abortable fiscal write.
 */
function invoicesWithSignal(
  client: FacturapiClient,
  signal?: AbortSignal,
): FacturapiClient["invoices"] {
  const invoices = client.invoices;
  if (!signal) return invoices;
  signal.throwIfAborted();
  const transport = invoices?.client;
  if (typeof transport?.request !== "function") {
    throw new Error("Facturapi transport does not support AbortSignal");
  }
  const scopedTransport = Object.create(transport);
  scopedTransport.request = (
    path: string,
    options: Record<string, unknown> = {},
  ) => transport.request(path, { ...options, signal });
  const scopedInvoices = Object.create(invoices);
  scopedInvoices.client = scopedTransport;
  return scopedInvoices;
}

/** Create without retrying fiscal writes; preserve the SDK's Date contract. */
export async function createInvoiceWithSignal(
  client: FacturapiClient,
  payload: Record<string, unknown>,
  opts: { signal?: AbortSignal } = {},
): Promise<{
  id: string;
  uuid?: string;
  status?: string;
  folio_number?: number | string | null;
  series?: string | null;
  total?: number;
}> {
  return await invoicesWithSignal(client, opts.signal).create(payload);
}

/** Cancel a CFDI with an abortable request and the SDK's query serialization. */
export async function cancelInvoiceWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  params: Record<string, unknown>,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  return await invoicesWithSignal(client, opts.signal).cancel(
    invoiceId,
    params,
  );
}

/** Retrieve a CFDI with an abortable request. */
export async function retrieveInvoiceWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  return await invoicesWithSignal(client, opts.signal).retrieve(invoiceId);
}

/** Download a PDF while keeping the transport abortable through body consumption. */
export async function downloadInvoicePdfWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  return await invoicesWithSignal(client, opts.signal).downloadPdf(invoiceId);
}

/** Force the SAT refresh; never substitute a cached retrieve for this PUT. */
export async function updateInvoiceStatusWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  return await invoicesWithSignal(client, opts.signal).updateStatus(invoiceId);
}

/**
 * Normaliza errores del SDK a la forma `{ message, code, status, detail }`
 * que las funciones devuelven al cliente.
 */
export function describeFacturapiError(err: unknown): {
  message: string;
  code: string | null;
  status: number;
  detail: string;
} {
  if (err instanceof FacturapiError) {
    const e = err as {
      message?: string;
      code?: string | null;
      status?: number;
      errors?: unknown;
      logId?: unknown;
    };
    return {
      message: e.message ?? "Facturapi error",
      code: e.code ?? null,
      status: e.status ?? 502,
      detail: JSON.stringify({
        code: e.code,
        message: e.message,
        errors: e.errors,
        logId: e.logId,
      }),
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  return { message: msg, code: null, status: 502, detail: msg };
}

/**
 * Convierte el resultado de `client.invoices.downloadXml/Pdf` a Uint8Array.
 * El SDK puede devolver Blob (fetch), Uint8Array/Buffer (Node), ArrayBuffer,
 * un ReadableStream, una Response, un string, o un objeto axios-like con
 * `.data`. Normalizamos todos los casos.
 */
export async function binaryToBytes(bin: unknown): Promise<Uint8Array> {
  if (bin == null) throw new Error("Empty binary response from Facturapi SDK");
  if (bin instanceof Uint8Array) return bin;
  if (bin instanceof ArrayBuffer) return new Uint8Array(bin);
  if (bin instanceof Blob) return new Uint8Array(await bin.arrayBuffer());
  if (typeof Response !== "undefined" && bin instanceof Response) {
    return new Uint8Array(await bin.arrayBuffer());
  }
  if (typeof ReadableStream !== "undefined" && bin instanceof ReadableStream) {
    return new Uint8Array(await new Response(bin).arrayBuffer());
  }
  if (typeof bin === "string") return new TextEncoder().encode(bin);
  // Axios-like: { data: <Buffer|ArrayBuffer|string|Blob> }
  const maybe = bin as {
    data?: unknown;
    arrayBuffer?: unknown;
    buffer?: unknown;
  };
  if (maybe.data !== undefined) return await binaryToBytes(maybe.data);
  if (typeof maybe.arrayBuffer === "function") {
    const ab = await (maybe as { arrayBuffer: () => Promise<ArrayBuffer> })
      .arrayBuffer();
    return new Uint8Array(ab);
  }
  // Node Buffer serializado como { type: 'Buffer', data: number[] }
  if (Array.isArray((bin as { data?: unknown[] }).data)) {
    return new Uint8Array((bin as { data: number[] }).data);
  }
  if (ArrayBuffer.isView(bin as ArrayBufferView)) {
    const v = bin as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }
  // Response-like / stream wrapper: { body: ReadableStream | ... }
  const withBody = bin as { body?: unknown; stream?: unknown; text?: unknown };
  if (withBody.body != null) return await binaryToBytes(withBody.body);
  if (withBody.stream != null) return await binaryToBytes(withBody.stream);
  // Async iterable (streams estilo Node / web sin instanceof compatible)
  const asyncIt = bin as { [Symbol.asyncIterator]?: unknown };
  if (typeof asyncIt[Symbol.asyncIterator] === "function") {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of bin as AsyncIterable<unknown>) {
      const part = await binaryToBytes(chunk);
      chunks.push(part);
      total += part.byteLength;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }
  if (typeof withBody.text === "function") {
    const t = await (bin as { text: () => Promise<string> }).text();
    return new TextEncoder().encode(t);
  }
  // Objeto tipo array indexado por números ({0:37,1:80,...})
  const numericKeys = Object.keys(bin as Record<string, unknown>);
  if (
    numericKeys.length > 0 &&
    numericKeys.every((k) => /^\d+$/.test(k)) &&
    numericKeys.every((k) =>
      typeof (bin as Record<string, unknown>)[k] === "number"
    )
  ) {
    const rec = bin as Record<string, number>;
    return Uint8Array.from(
      numericKeys.sort((a, b) => Number(a) - Number(b)).map((k) => rec[k]),
    );
  }

  throw new Error(
    `Unsupported binary download type from Facturapi SDK: ${
      Object.prototype.toString.call(bin)
    } keys=[${numericKeys.slice(0, 12).join(",")}]`,
  );
}

export async function binaryToText(bin: unknown): Promise<string> {
  if (bin instanceof Blob) return await bin.text();
  const bytes = await binaryToBytes(bin);
  return new TextDecoder().decode(bytes);
}

/**
 * Usar sólo para lecturas (GET): 5xx/red y 429 con Retry-After breve.
 * Un Retry-After largo se difiere al siguiente ciclo en vez de bloquear el cron.
 */
export async function retryOnFacturapi5xx<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const desc = describeFacturapiError(err);
      const sdkError = err as {
        status?: unknown;
        code?: unknown;
        headers?: Record<string, string>;
      };
      const status = typeof sdkError?.status === "number"
        ? sdkError.status
        : desc.status;
      const isRateLimit = status === 429 &&
        sdkError?.code === "rate_limit_exceeded";
      const retriable = status === 0 ||
        (status >= 500 && status <= 599) || isRateLimit;
      if (!retriable || i === attempts - 1) throw err;
      const retryAfter = Number(sdkError?.headers?.["retry-after"]);
      if (isRateLimit && (!Number.isFinite(retryAfter) || retryAfter > 10)) {
        throw err;
      }
      const delay = isRateLimit
        ? Math.max(0, retryAfter * 1_000)
        : baseDelayMs * Math.pow(3, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
