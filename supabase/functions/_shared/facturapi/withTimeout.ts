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
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      throw new FacturapiTimeoutError(timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
