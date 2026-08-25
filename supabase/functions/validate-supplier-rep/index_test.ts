// Smoke tests para validate-supplier-rep (admin/administrativo).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchFn, fnUrl } from "../_shared/test-helpers.ts";
import { isWellFormedXml } from "./index.ts";

const FN_URL = fnUrl("validate-supplier-rep");

Deno.test("validate-supplier-rep: CORS preflight returns 200", async () => {
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

Deno.test("validate-supplier-rep: rechaza sin Authorization (401)", async () => {
  const res = await fetchFn(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payment_id: "00000000-0000-0000-0000-000000000000",
    }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("validate-supplier-rep: rechaza Authorization inválido (401)", async () => {
  const res = await fetchFn(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer invalid-token-xyz",
    },
    body: JSON.stringify({
      payment_id: "00000000-0000-0000-0000-000000000000",
      xml_base64: "PHRlc3Qv",
    }),
  });
  await res.text();
  assertEquals(res.status, 401);
});

// L-8: chequeo estructural de XML bien formado antes del parseo por regex.

Deno.test("isWellFormedXml: acepta XML válido con declaración y namespaces", () => {
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><cfdi:Comprobante TipoDeComprobante="P"><cfdi:Emisor Rfc="AAA010101AAA"/><cfdi:Complemento><pago20:Pagos><pago20:Pago Monto="100.00"/></pago20:Pagos></cfdi:Complemento></cfdi:Comprobante>`;
  assertEquals(isWellFormedXml(xml), true);
});

Deno.test("isWellFormedXml: rechaza XML truncado", () => {
  const xml = `<?xml version="1.0"?><cfdi:Comprobante><cfdi:Emisor Rfc="AAA010101AAA"/>`;
  assertEquals(isWellFormedXml(xml), false);
});

Deno.test("isWellFormedXml: rechaza tags desbalanceados", () => {
  const xml = `<a><b></a></b>`;
  assertEquals(isWellFormedXml(xml), false);
});

Deno.test("isWellFormedXml: rechaza contenido que no es XML", () => {
  assertEquals(isWellFormedXml("no soy xml"), false);
  assertEquals(isWellFormedXml(""), false);
});
