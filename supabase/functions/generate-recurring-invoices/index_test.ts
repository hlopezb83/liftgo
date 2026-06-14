// Smoke tests for generate-recurring-invoices (cron / service-role function).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("generate-recurring-invoices");

Deno.test("generate-recurring-invoices: CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: {
      Origin: "https://example.com",
      "Access-Control-Request-Method": "POST",
    },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("generate-recurring-invoices: rejects without Authorization (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("generate-recurring-invoices: rejects malformed Authorization (401)", async () => {
  // Antes el guard usaba `if (!authHeader)` y permitía pasar headers
  // malformados sin prefijo Bearer, provocando errores downstream en getClaims.
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "malformed-token-without-bearer",
    },
  });
  await res.text();
  assertEquals(res.status, 401);
});
