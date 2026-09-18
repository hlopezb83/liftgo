// Smoke: invite-user quedó retirado (410) por la auditoría multiempresa.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchFn, fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("invite-user");

Deno.test("invite-user: CORS preflight returns 200", async () => {
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

Deno.test("invite-user: endpoint retirado responde 410", async () => {
  const res = await fetchFn(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "retirado@example.test" }),
  });
  await res.text();
  assertEquals(res.status, 410);
});
