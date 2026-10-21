import { describe, expect, it } from "vitest";
import { classifyConsoleError, normalizeUrl } from "../../tests/smoke/consoleNoise";

/**
 * Regresión del fallo real de CI (run 34204475380): el smoke recibía 4 veces
 * `Failed to load resource: net::ERR_FAILED` y el filtro miraba solo el texto
 * del mensaje, que NO trae la URL — imposible correlacionarlo con las
 * peticiones que el propio spec abortó, así que el job fallaba.
 *
 * La frontera que estas pruebas fijan: red externa bloqueada por la prueba se
 * ignora; un asset del propio origen con el MISMO texto siempre falla.
 */

const ORIGIN = "http://localhost:4173";
const TRANSPORT = "Failed to load resource: net::ERR_FAILED";
const BLOCKED_URL = "http://127.0.0.1:54321/auth/v1/token?grant_type=password";

function ctx(...blocked: string[]) {
  return { origin: ORIGIN, blocked: new Set(blocked.map(normalizeUrl)) };
}

describe("clasificación del ruido de consola del smoke", () => {
  it("ignora el error de transporte de una petición EXTERNA que la prueba abortó", () => {
    const verdict = classifyConsoleError(
      { text: TRANSPORT, url: BLOCKED_URL },
      ctx(BLOCKED_URL),
    );
    expect(verdict.ignored).toBe(true);
    expect(verdict.diagnostic).toContain(BLOCKED_URL);
  });

  it("FALLA con el mismo texto cuando la URL es un asset del propio origen", () => {
    const own = `${ORIGIN}/assets/index-abc123.js`;
    const verdict = classifyConsoleError({ text: TRANSPORT, url: own }, ctx(BLOCKED_URL));
    expect(verdict.ignored).toBe(false);
    expect(verdict.diagnostic).toContain(own);
  });

  it("FALLA cuando el error de transporte no trae URL atribuible", () => {
    const verdict = classifyConsoleError({ text: TRANSPORT }, ctx(BLOCKED_URL));
    expect(verdict.ignored).toBe(false);
    expect(verdict.diagnostic).toContain("sin URL atribuida");
  });

  it("FALLA con una URL externa que ESTA prueba no bloqueó", () => {
    const verdict = classifyConsoleError(
      { text: TRANSPORT, url: "https://cdn.example.com/x.js" },
      ctx(BLOCKED_URL),
    );
    expect(verdict.ignored).toBe(false);
  });

  it("correlaciona aunque la URL del mensaje traiga hash", () => {
    const verdict = classifyConsoleError(
      { text: TRANSPORT, url: `${BLOCKED_URL}#frag` },
      ctx(BLOCKED_URL),
    );
    expect(verdict.ignored).toBe(true);
  });

  it("NO ignora errores que no son de transporte, aunque vengan de una URL bloqueada", () => {
    for (const text of [
      "TypeError: Failed to fetch",
      "AuthRetryableFetchError: Network request failed",
      "Uncaught ReferenceError: __name is not defined",
      "Warning: Hydration failed because the initial UI does not match",
    ]) {
      const verdict = classifyConsoleError({ text, url: BLOCKED_URL }, ctx(BLOCKED_URL));
      expect(verdict.ignored, text).toBe(false);
    }
  });

  it("cubre las variantes reales de net::ERR_* bloqueadas", () => {
    for (const text of [
      "Failed to load resource: net::ERR_FAILED",
      "Failed to load resource: net::ERR_CONNECTION_REFUSED",
      "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT",
    ]) {
      const verdict = classifyConsoleError({ text, url: BLOCKED_URL }, ctx(BLOCKED_URL));
      expect(verdict.ignored, text).toBe(true);
    }
  });
});
