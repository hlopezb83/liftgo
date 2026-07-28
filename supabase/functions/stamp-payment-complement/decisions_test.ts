// TESTS-ARQ2 v2 · DIFF 9: contrato Anexo 20 EquivalenciaDR=1 blindado.
// Antes del fix R10-8.2, un pago en MXN sobre una factura en MXN con
// `tipo_cambio=17.5` capturado por error mandaba EquivalenciaDR=17.5 al PAC
// y el timbrado fallaba con CFDI40230. Este test evita la regresión.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimRejectionMessage, computeRepExchange } from "./decisions.ts";

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

// TESTS-ARQ2 v3 · DIFF 9 residual: parcialidades REP (NumParcialidad / ImpSaldoAnt / ImpSaldoInsoluto).
import { assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeInstallmentMeta } from "./decisions.ts";

Deno.test("primera parcialidad: sin pagos previos → N=1, saldoAnt=total", () => {
  assertEquals(
    computeInstallmentMeta({
      previousPayments: [],
      invoiceTotal: 1160,
      thisAmount: 500,
    }),
    { numParcialidad: 1, impSaldoAnt: 1160, impSaldoInsoluto: 660 },
  );
});

Deno.test("N-ésima parcialidad: suma pagos previos y descuenta del total", () => {
  assertEquals(
    computeInstallmentMeta({
      previousPayments: [{ amount: 500 }, { amount: 300 }],
      invoiceTotal: 1160,
      thisAmount: 360,
    }),
    { numParcialidad: 3, impSaldoAnt: 360, impSaldoInsoluto: 0 },
  );
});

Deno.test("pago que excede saldo (> 1 centavo) → payment_exceeds_balance", () => {
  assertThrows(
    () =>
      computeInstallmentMeta({
        previousPayments: [{ amount: 1000 }],
        invoiceTotal: 1160,
        thisAmount: 200,
      }),
    Error,
    "payment_exceeds_balance",
  );
});

Deno.test("pago con diferencia ≤ 1 centavo (redondeo Anexo 20) → OK", () => {
  const r = computeInstallmentMeta({
    previousPayments: [{ amount: 1159.995 }],
    invoiceTotal: 1160,
    thisAmount: 0.01,
  });
  assertEquals(r.numParcialidad, 2);
  // Tolerancia de redondeo aceptada.
  assertEquals(r.impSaldoInsoluto <= 0.01, true);
});

Deno.test("pagos previos con montos inválidos (NaN, negativos) se ignoran", () => {
  assertEquals(
    computeInstallmentMeta({
      previousPayments: [{ amount: Number.NaN }, { amount: -50 }, {
        amount: 500,
      }],
      invoiceTotal: 1160,
      thisAmount: 100,
    }),
    { numParcialidad: 4, impSaldoAnt: 660, impSaldoInsoluto: 560 },
  );
});

Deno.test("invoice_total inválido → invoice_total_invalid", () => {
  assertThrows(
    () =>
      computeInstallmentMeta({
        previousPayments: [],
        invoiceTotal: 0,
        thisAmount: 100,
      }),
    Error,
    "invoice_total_invalid",
  );
});

Deno.test("thisAmount ≤ 0 → payment_amount_invalid", () => {
  assertThrows(
    () =>
      computeInstallmentMeta({
        previousPayments: [],
        invoiceTotal: 1000,
        thisAmount: 0,
      }),
    Error,
    "payment_amount_invalid",
  );
});

// R-REP-409: mensajes accionables cuando el claim atómico es rechazado.
Deno.test("claimRejectionMessage · stamped → ya timbrado", () => {
  assertEquals(
    claimRejectionMessage("stamped"),
    "Este pago ya tiene un REP timbrado",
  );
});

Deno.test("claimRejectionMessage · stamping → en proceso", () => {
  assertEquals(
    claimRejectionMessage("stamping"),
    "El timbrado de este REP está en proceso. Espera unos segundos y actualiza.",
  );
});

Deno.test("claimRejectionMessage · estado desconocido incluye el estado", () => {
  assertEquals(
    claimRejectionMessage("weird"),
    "No se puede timbrar el REP en el estado actual del pago (weird).",
  );
  assertEquals(
    claimRejectionMessage(null),
    "No se puede timbrar el REP en el estado actual del pago (desconocido).",
  );
});
