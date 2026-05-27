// Smoke tests for invite-user edge function (admin-only).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
const FN_URL = `${SUPABASE_URL}/functions/v1/invite-user`;

Deno.test("invite-user: CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: { Origin: "https://example.com", "Access-Control-Request-Method": "POST" },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("invite-user: rejects requests without Authorization header (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", role: "ventas" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});
