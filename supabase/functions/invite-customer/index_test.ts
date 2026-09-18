// Smoke: invite-customer quedó retirado (410) por la auditoría multiempresa.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchFn, fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("invite-customer");

Deno.test("invite-customer: CORS preflight returns 200", async () => {
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

Deno.test("invite-customer: endpoint retirado responde 410", async () => {
  const res = await fetchFn(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_id: "00000000-0000-0000-0000-000000000000",
    }),
  });
  await res.text();
  assertEquals(res.status, 410);
});
