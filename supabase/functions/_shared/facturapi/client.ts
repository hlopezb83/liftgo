// Wrapper centralizado del SDK oficial de Facturapi.
// El SDK usa globalThis.fetch internamente, por lo que sigue siendo
// interceptable por los mocks de tests existentes (facturapiMock.ts).
//
// Ventajas vs fetch directo:
// - Auth y serialización gestionadas por el SDK.
// - Errores tipados (`FacturapiError` con .status, .code, .message).
// - Mantenido oficialmente por Facturapi (v4.18+).
//
// deno-lint-ignore-file no-explicit-any
import * as FacturapiPkg from "npm:facturapi@4.18.0";

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

export async function getFacturapiConfig(
  admin: { from: (table: string) => any },
  env: (key: string) => string | undefined,
  opts?: { modeOverride?: string | null | undefined },
): Promise<FacturapiConfig> {
  let modeRaw: string | null | undefined = opts?.modeOverride;
  if (modeRaw === undefined) {
    const { data: co } = await admin
      .from("company_settings").select("facturapi_mode").limit(1).maybeSingle();
    modeRaw = (co?.facturapi_mode as string | undefined) ?? null;
  }
  const mode: FacturapiMode = modeRaw === "live" ? "live" : "test";
  const { data: secrets } = await admin
    .from("billing_secrets")
    .select("facturapi_test_key, facturapi_live_key").limit(1).maybeSingle();
  const sec = (secrets ?? {}) as Record<string, unknown>;
  const apiKey = resolveFacturapiKey({
    mode,
    dbTestKey: sec.facturapi_test_key as string | null | undefined,
    dbLiveKey: sec.facturapi_live_key as string | null | undefined,
    envTestKey: env("FACTURAPI_TEST_KEY"),
    envLiveKey: env("FACTURAPI_LIVE_KEY"),
  });
  return { mode, apiKey };
}

/** Crea una instancia del SDK con la API key resuelta. */
/** Crea una instancia del SDK con la API key resuelta. */
export function createFacturapiClient(apiKey: string): FacturapiClient {
  return new Facturapi(apiKey);
}

/**
 * EC-A2: timbra una factura soportando AbortSignal (timeout con abort real).
 *
 * `invoices.create()` del SDK no acepta `signal`, pero el wrapper HTTP interno
 * (campo público `client` del recurso, tipado como WrapperClient en el paquete)
 * esparce las opciones extra en el RequestInit del fetch subyacente — verificado
 * en facturapi@4.18.0 (`request()` hace `{...rest, headers, body}`). Llamamos al
 * wrapper directamente y así el AbortController sí cancela el socket en vuelo.
 *
 * Si el cliente no expone el wrapper (p. ej. un mock distinto en tests), cae al
 * método estándar del SDK sin signal.
 */
export async function createInvoiceWithSignal(
  client: FacturapiClient,
  payload: Record<string, unknown>,
  opts: { signal?: AbortSignal } = {},
): Promise<{ id: string; uuid: string }> {
  const wrapper = client?.invoices?.client;
  if (wrapper && typeof wrapper.post === "function") {
    const init: Record<string, unknown> = { body: payload };
    if (opts.signal) init.signal = opts.signal;
    return (await wrapper.post("/invoices", init)) as {
      id: string;
      uuid: string;
    };
  }
  return (await client.invoices.create(payload)) as {
    id: string;
    uuid: string;
  };
}

/** ARQ2-A1: cancela un CFDI soportando AbortSignal (mismo patrón que createInvoiceWithSignal). */
export async function cancelInvoiceWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  params: Record<string, unknown>,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  const wrapper = client?.invoices?.client;
  if (wrapper && typeof wrapper.del === "function") {
    const init: Record<string, unknown> = { params };
    if (opts.signal) init.signal = opts.signal;
    return await wrapper.del(`/invoices/${invoiceId}`, init);
  }
  return await client.invoices.cancel(invoiceId, params);
}

/** ARQ2-A1: consulta un CFDI soportando AbortSignal. */
export async function retrieveInvoiceWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  const wrapper = client?.invoices?.client;
  if (wrapper && typeof wrapper.get === "function") {
    const init: Record<string, unknown> = {};
    if (opts.signal) init.signal = opts.signal;
    return await wrapper.get(`/invoices/${invoiceId}`, init);
  }
  return await client.invoices.retrieve(invoiceId);
}

/** ARQ2-A1: fuerza el refresh de estado en SAT soportando AbortSignal. */
export async function updateInvoiceStatusWithSignal(
  client: FacturapiClient,
  invoiceId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<unknown> {
  const wrapper = client?.invoices?.client;
  if (wrapper && typeof wrapper.get === "function") {
    const init: Record<string, unknown> = {};
    if (opts.signal) init.signal = opts.signal;
    return await wrapper.get(`/invoices/${invoiceId}/status`, init);
  }
  // Fallback al método del SDK si el wrapper no está disponible.
  // deno-lint-ignore no-explicit-any
  const inv = client.invoices as any;
  if (typeof inv.updateStatus === "function") return await inv.updateStatus(invoiceId);
  return await client.invoices.retrieve(invoiceId);
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
    return {
      message: err.message ?? "Facturapi error",
      code: err.code ?? null,
      status: err.status ?? 502,
      detail: JSON.stringify({
        code: err.code,
        message: err.message,
        errors: err.errors,
        logId: err.logId,
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
  throw new Error(
    `Unsupported binary download type from Facturapi SDK: ${
      Object.prototype.toString.call(bin)
    }`,
  );
}

export async function binaryToText(bin: unknown): Promise<string> {
  if (bin instanceof Blob) return await bin.text();
  const bytes = await binaryToBytes(bin);
  return new TextDecoder().decode(bytes);
}

/**
 * Reintenta `fn` con backoff exponencial cuando Facturapi devuelve 5xx o
 * cuando la llamada falla por red (status=0). Los 4xx (validaciones)
 * salen inmediatamente sin reintentar.
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
      const retriable = desc.status === 0 ||
        (desc.status >= 500 && desc.status <= 599);
      if (!retriable || i === attempts - 1) throw err;
      const delay = baseDelayMs * Math.pow(3, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
