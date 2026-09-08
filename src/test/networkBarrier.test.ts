import { describe, expect, it } from "vitest";
import { NETWORK_BLOCKED_MESSAGE } from "./setup";

/**
 * Cubre la barrera de red del setup: ningún test puede salir a internet
 * (ni, por tanto, al backend productivo). No genera tráfico: la petición se
 * rechaza antes de abrir socket.
 */
describe("barrera de red de la suite", () => {
  it("rechaza cualquier fetch real", async () => {
    await expect(fetch("https://example.invalid/rest/v1/x")).rejects.toThrow(
      /Red real bloqueada/,
    );
  });

  it("usa variables Supabase ficticias, nunca las del .env productivo", () => {
    expect(import.meta.env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(String(import.meta.env.VITE_SUPABASE_URL)).not.toMatch(/supabase\.co/);
  });

  it("bloquea también escrituras REST hacia cualquier host Supabase", async () => {
    // La prueba retirada hacía PATCH real contra producción. Aquí sólo se
    // comprueba que la barrera corta la salida: nunca sale tráfico.
    await expect(
      fetch("https://zxefrzfaynnfwazqhwxp.supabase.co/rest/v1/customer_payment_intents", {
        method: "PATCH",
      }),
    ).rejects.toThrow(NETWORK_BLOCKED_MESSAGE);
  });

  it("rechaza, nunca devuelve una respuesta falsa que simule éxito", async () => {
    const result = await fetch("https://example.invalid/x").then(
      (r) => ({ kind: "resolved" as const, ok: r.ok }),
      (e: Error) => ({ kind: "rejected" as const, ok: false, message: e.message }),
    );
    expect(result.kind).toBe("rejected");
    expect(result.ok).toBe(false);
  });
});
