// Smoke tests para generate-invoice-pdf (renderizado server-side de factura).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("generate-invoice-pdf");

Deno.test("generate-invoice-pdf: CORS preflight returns 200", async () => {
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

Deno.test("generate-invoice-pdf: rejects without Authorization (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      invoice_id: "00000000-0000-0000-0000-000000000000",
    }),
  });
  await res.text();
  assertEquals(res.status, 401);
});
