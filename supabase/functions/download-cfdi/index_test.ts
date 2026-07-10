// Smoke tests para download-cfdi (verifica CORS + guards de auth/payload).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fnUrl } from "../_shared/test-helpers.ts";

const FN_URL = fnUrl("download-cfdi");

Deno.test("download-cfdi: CORS preflight returns 200", async () => {
  const res = await fetch(FN_URL, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:8080",
      "Access-Control-Request-Method": "POST",
    },
  });
  await res.text();
  assertEquals(res.status, 200);
});

Deno.test("download-cfdi: rejects without Authorization (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_id: "x", format: "pdf" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("download-cfdi: rejects malformed Authorization (401)", async () => {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "not-a-bearer-token",
    },
    body: JSON.stringify({ invoice_id: "x", format: "pdf" }),
  });
  await res.text();
  assertEquals(res.status, 401);
});
