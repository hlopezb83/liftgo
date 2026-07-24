// TESTS-ARQ2 v2 · DIFF 9: contrato Anexo 20 EquivalenciaDR=1 blindado.
// Antes del fix R10-8.2, un pago en MXN sobre una factura en MXN con
// `tipo_cambio=17.5` capturado por error mandaba EquivalenciaDR=17.5 al PAC
// y el timbrado fallaba con CFDI40230. Este test evita la regresión.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeRepExchange } from "./decisions.ts";

Deno.test("MonedaP == MonedaDR (ambos MXN) → exchange=1, ignorando tipo_cambio guardado", () => {
  assertEquals(
    computeRepExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "MXN",
      invoiceTipoCambio: 17.5, // valor sucio en DB — NO debe llegar al PAC
    }),
    { invoiceCurrency: "MXN", invoiceExchange: 1 },
  );
});

Deno.test("MonedaP == MonedaDR (ambos USD) → exchange=1", () => {
  assertEquals(
    computeRepExchange({
      paymentCurrency: "USD",
      invoiceCurrency: "USD",
      invoiceTipoCambio: 18.2,
    }),
    { invoiceCurrency: "USD", invoiceExchange: 1 },
  );
});

Deno.test("MonedaP != MonedaDR → usa tipo_cambio de la factura origen", () => {
  assertEquals(
    computeRepExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "USD",
      invoiceTipoCambio: 18.5,
    }),
    { invoiceCurrency: "USD", invoiceExchange: 18.5 },
  );
});

Deno.test("MonedaP != MonedaDR sin tipo_cambio válido → fallback 1 (evita NaN)", () => {
  assertEquals(
    computeRepExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "USD",
      invoiceTipoCambio: null,
    }),
    { invoiceCurrency: "USD", invoiceExchange: 1 },
  );
  assertEquals(
    computeRepExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "USD",
      invoiceTipoCambio: "no-numero",
    }),
    { invoiceCurrency: "USD", invoiceExchange: 1 },
  );
  assertEquals(
    computeRepExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "USD",
      invoiceTipoCambio: -1,
    }),
    { invoiceCurrency: "USD", invoiceExchange: 1 },
  );
});

Deno.test("normalización de mayúsculas: 'mxn'/'usd' se tratan como MXN/USD", () => {
  assertEquals(
    computeRepExchange({
      paymentCurrency: "mxn",
      invoiceCurrency: "MXN",
      invoiceTipoCambio: 99,
    }),
    { invoiceCurrency: "MXN", invoiceExchange: 1 },
  );
});

Deno.test("moneda ausente en pago o factura → default MXN", () => {
  assertEquals(
    computeRepExchange({
      paymentCurrency: null,
      invoiceCurrency: undefined,
      invoiceTipoCambio: 1,
    }),
    { invoiceCurrency: "MXN", invoiceExchange: 1 },
  );
});
