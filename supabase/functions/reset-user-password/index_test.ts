// Smoke tests for reset-user-password edge function.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("reset-user-password");

Deno.test("reset-user-password: CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: { Origin: "https://example.com", "Access-Control-Request-Method": "POST" },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("reset-user-password: rejects requests without Authorization header (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("reset-user-password: rejects invalid bearer token (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-a-real-jwt",
    },
    body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});
