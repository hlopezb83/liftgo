// Smoke tests for parse-cfdi-expense edge function (admin/administrativo only).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("parse-cfdi-expense");

Deno.test("parse-cfdi-expense: CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: { Origin: "https://example.com", "Access-Control-Request-Method": "POST" },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("parse-cfdi-expense: rejects requests without Authorization header (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xml: "<cfdi:Comprobante/>" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});
