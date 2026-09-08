import { describe, expect, it } from "vitest";
import { consumeBlockedNetworkAttempts, NETWORK_BLOCKED_MESSAGE } from "./setup";

/**
 * Cubre la barrera de red del setup: ningún test puede salir a internet
 * (ni, por tanto, a un backend real). No genera tráfico: la petición se
 * rechaza antes de abrir socket y se usan hosts reservados `.invalid`.
 *
 * Cada test reclama explícitamente sus intentos esperados; si un consumidor
 * se tragara el rechazo sin reclamarlo, el `afterEach` del setup lo delata.
 */
describe("barrera de red de la suite", () => {
  it("rechaza cualquier fetch real", async () => {
    await expect(fetch("https://ejemplo.invalid/rest/v1/x")).rejects.toThrow(
      /Red real bloqueada/,
    );
    expect(consumeBlockedNetworkAttempts()).toEqual([
      "https://ejemplo.invalid/rest/v1/x",
    ]);
  });

  it("usa variables Supabase ficticias, nunca las del .env productivo", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(String(import.meta.env.VITE_SUPABASE_URL)).not.toMatch(/supabase\.co/);
  });

  it("bloquea también escrituras REST de estilo Supabase", async () => {
    // La prueba retirada hacía PATCH real contra el proyecto productivo. Aquí
    // se usa un host reservado: no hay tráfico ni referencia al host real.
    await expect(
      fetch("https://proyecto-ficticio.supabase.invalid/rest/v1/customer_payment_intents", {
        method: "PATCH",
      }),
    ).rejects.toThrow(NETWORK_BLOCKED_MESSAGE);
    expect(consumeBlockedNetworkAttempts()).toHaveLength(1);
  });

  it("rechaza, nunca devuelve una respuesta falsa que simule éxito", async () => {
    const result = await fetch("https://ejemplo.invalid/x").then(
      (r) => ({ kind: "resolved" as const, ok: r.ok }),
      (e: Error) => ({ kind: "rejected" as const, ok: false, message: e.message }),
    );
    expect(result.kind).toBe("rejected");
    expect(result.ok).toBe(false);
    expect(consumeBlockedNetworkAttempts()).toEqual(["https://ejemplo.invalid/x"]);
  });

  it("registra el intento aunque el consumidor se trague el rechazo", async () => {
    // Consumidor silencioso: sin el registro, esta fuga pasaría en verde.
    await fetch("https://fuga-silenciosa.invalid/x").catch(() => undefined);
    expect(consumeBlockedNetworkAttempts()).toEqual([
      "https://fuga-silenciosa.invalid/x",
    ]);
  });
});
