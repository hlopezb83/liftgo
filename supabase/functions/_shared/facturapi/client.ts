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

/** Crea una instancia del SDK con la API key resuelta. */
/** Crea una instancia del SDK con la API key resuelta. */
export function createFacturapiClient(apiKey: string): FacturapiClient {
  return new Facturapi(apiKey);
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
