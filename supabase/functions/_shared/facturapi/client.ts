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
 * En Deno el SDK siempre devuelve un Blob.
 */
export async function binaryToBytes(bin: unknown): Promise<Uint8Array> {
  if (bin instanceof Blob) {
    return new Uint8Array(await bin.arrayBuffer());
  }
  if (bin instanceof Uint8Array) return bin;
  if (bin instanceof ArrayBuffer) return new Uint8Array(bin);
  // Stream tipo Node (defensivo, no debería ocurrir en Deno).
  if (
    bin && typeof (bin as { arrayBuffer?: unknown }).arrayBuffer === "function"
  ) {
    const ab = await (bin as { arrayBuffer: () => Promise<ArrayBuffer> })
      .arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new Error("Unsupported binary download type from Facturapi SDK");
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

