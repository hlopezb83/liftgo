/**
 * R-arq DIFF 3 — `fetchWithTimeout`
 *
 * Envuelve `fetch` con un `AbortController` que cancela el socket cuando el
 * timeout expira (30s por defecto). Reemplaza los `fetch(` directos a Facturapi
 * que quedaban en `download-cfdi/index.ts`; el resto de flujos pasan por el
 * SDK Facturapi (ver `_shared/facturapi/client.ts`), que ya usa retry propio.
 *
 * Extraído del patrón probado en `stamp-cfdi/handler.ts` (EC-A2).
 */
export const DEFAULT_FACTURAPI_TIMEOUT_MS = 30_000;

export class FacturapiTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`PAC no respondió en ${Math.round(timeoutMs / 1000)}s, reintenta`);
    this.name = "FacturapiTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FACTURAPI_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new FacturapiTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ARQ2-A1: Promise.race con timeout para llamadas SDK.
 *
 * Cuando el wrapper HTTP del SDK acepta `signal`, la llamada se aborta
 * limpiamente. Cuando no lo acepta (fallback), la promesa sigue viva pero
 * el race resuelve por timeout y el handler responde 504 sin colgarse.
 */
export async function sdkCallWithTimeout<T>(
  call: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_FACTURAPI_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let rejectOnTimeout!: (err: unknown) => void;
  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectOnTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectOnTimeout(new FacturapiTimeoutError(timeoutMs));
  }, timeoutMs);
  try {
    return await Promise.race([call(controller.signal), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

export function isFacturapiTimeout(err: unknown): err is FacturapiTimeoutError {
  return err instanceof FacturapiTimeoutError;
}
