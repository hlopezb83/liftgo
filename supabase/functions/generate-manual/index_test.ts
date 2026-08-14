// Smoke tests for generate-manual edge function (admin-only, rate limited
// 5/60s — M2-06).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchFn, fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("generate-manual");

Deno.test("generate-manual: CORS preflight returns 200", async () => {
  const res = await fetchFn(FN_URL, {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.com",
      "Access-Control-Request-Method": "POST",
    },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("generate-manual: rejects requests without Authorization header (401)", async () => {
  const res = await fetchFn(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  await res.text();
  assertEquals(res.status, 401);
});
