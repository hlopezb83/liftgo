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

  it("un cliente Supabase real falla de forma visible, no en falso verde", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase
      .from("customer_payment_intents")
      .select("id")
      .limit(1);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(NETWORK_BLOCKED_MESSAGE).toContain("offline");
  });
});
