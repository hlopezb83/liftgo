import "@testing-library/jest-dom";

/**
 * Barrera de red: la suite de Vitest es OFFLINE.
 *
 * Un test podía crear un cliente Supabase real y golpear el proyecto
 * PRODUCTIVO (ocurrió con paymentIntentsRls.test.ts). Aquí sustituimos el
 * `fetch` global por uno que falla de inmediato ante cualquier salida real.
 * Los tests que necesiten transporte simulado siguen pudiendo usar
 * `vi.stubGlobal("fetch", ...)` o `vi.spyOn(globalThis, "fetch")`.
 */
export const NETWORK_BLOCKED_MESSAGE =
  "[test] Red real bloqueada: la suite de Vitest es offline. Usa un mock explícito de fetch.";

globalThis.fetch = ((input: RequestInfo | URL) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;
  return Promise.reject(new Error(`${NETWORK_BLOCKED_MESSAGE} (${url})`));
}) as typeof fetch;

interface MatchMediaMock {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: () => void;
  removeListener: () => void;
  addEventListener: () => void;
  removeEventListener: () => void;
  dispatchEvent: () => void;
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MatchMediaMock => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
