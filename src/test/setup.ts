import "@testing-library/jest-dom";
import { afterEach } from "vitest";

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

/** URLs de intentos bloqueados que aún no ha reclamado el test en curso. */
const blockedAttempts: string[] = [];

/**
 * Reclama (y limpia) los intentos de red bloqueados del test actual.
 * Un test que espere un rechazo DEBE consumirlos; si no, el `afterEach`
 * falla y un consumidor que se trague el error no puede pasar en verde.
 */
export function consumeBlockedNetworkAttempts(): string[] {
  const attempts = [...blockedAttempts];
  blockedAttempts.length = 0;
  return attempts;
}

globalThis.fetch = ((input: RequestInfo | URL) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;
  blockedAttempts.push(url);
  return Promise.reject(new Error(`${NETWORK_BLOCKED_MESSAGE} (${url})`));
}) as typeof fetch;

afterEach(() => {
  try {
    if (blockedAttempts.length > 0) {
      throw new Error(
        `${NETWORK_BLOCKED_MESSAGE} Intentos no reclamados: ${blockedAttempts.join(", ")}`,
      );
    }
  } finally {
    blockedAttempts.length = 0;
  }
});

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
