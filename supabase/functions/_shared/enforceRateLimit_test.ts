// Tests unitarios de enforceRateLimit — usado por generate-manual (5 req /
// 60s por usuario, M2-06) y otras funciones sensibles de AI/admin.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceRateLimit } from "./auth.ts";
import { buildSupabaseMock } from "./test/supabaseClientMock.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function req() {
  return new Request("http://localhost/fn", { method: "POST" });
}

Deno.test("enforceRateLimit: RPC permite (data=true) → null (no bloquea)", async () => {
  const { client } = buildSupabaseMock({ rpcs: { check_and_record_rate_limit: { data: true, error: null } } });
  const res = await enforceRateLimit(req(), client as unknown as SupabaseClient, "generate-manual", "user-1", 5, 60);
  assertEquals(res, null);
});

Deno.test("enforceRateLimit: RPC deniega (data=false) → 429 con Retry-After", async () => {
  const { client } = buildSupabaseMock({ rpcs: { check_and_record_rate_limit: { data: false, error: null } } });
  const res = await enforceRateLimit(req(), client as unknown as SupabaseClient, "generate-manual", "user-1", 5, 60);
  if (!res) throw new Error("se esperaba una respuesta 429");
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Retry-After") !== null, true);
});

Deno.test("enforceRateLimit: error del RPC → fail-closed 503", async () => {
  const { client } = buildSupabaseMock({
    rpcs: { check_and_record_rate_limit: { data: null, error: { message: "db down" } } },
  });
  const res = await enforceRateLimit(req(), client as unknown as SupabaseClient, "generate-manual", "user-1", 5, 60);
  if (!res) throw new Error("se esperaba una respuesta 503");
  assertEquals(res.status, 503);
});
