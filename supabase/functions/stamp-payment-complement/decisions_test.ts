// TESTS-ARQ2 v2 · DIFF 9: contrato Anexo 20 EquivalenciaDR=1 blindado.
// Antes del fix R10-8.2, un pago en MXN sobre una factura en MXN con
// `tipo_cambio=17.5` capturado por error mandaba EquivalenciaDR=17.5 al PAC
// y el timbrado fallaba con CFDI40230. Este test evita la regresión.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimRejectionMessage,
  computeRepExchange,
  validatePaymentExchange,
  validateRelatedInvoiceExchange,
} from "./decisions.ts";

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

Deno.test("claimRejectionMessage · not_found → pago inexistente", () => {
  assertEquals(claimRejectionMessage("not_found"), "El pago ya no existe.");
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

// v7.320.6: guardia defensiva de tipo de cambio para moneda extranjera.

Deno.test("validatePaymentExchange: MXN siempre ok (ignora exchange_rate)", () => {
  assertEquals(
    validatePaymentExchange({ paymentCurrency: "MXN", exchangeRate: null }),
    { ok: true },
  );
  assertEquals(
    validatePaymentExchange({ paymentCurrency: "MXN", exchangeRate: 0 }),
    { ok: true },
  );
  assertEquals(
    validatePaymentExchange({ paymentCurrency: "mxn", exchangeRate: 17.5 }),
    { ok: true },
  );
  assertEquals(
    validatePaymentExchange({ paymentCurrency: null, exchangeRate: null }),
    { ok: true },
  );
});

Deno.test("validatePaymentExchange: USD sin TC (null/0) → rechazo 422", () => {
  const r1 = validatePaymentExchange({
    paymentCurrency: "USD",
    exchangeRate: null,
  });
  assertEquals(r1.ok, false);
  assertEquals(
    (r1 as { ok: false; message: string }).message,
    "El Tipo de Cambio es obligatorio y debe ser mayor a 0 para pagos en moneda extranjera.",
  );
  const r2 = validatePaymentExchange({
    paymentCurrency: "USD",
    exchangeRate: 0,
  });
  assertEquals(r2.ok, false);
  const r3 = validatePaymentExchange({
    paymentCurrency: "USD",
    exchangeRate: -5,
  });
  assertEquals(r3.ok, false);
});

Deno.test("validatePaymentExchange: USD con TC inválido (NaN/ string) → rechazo 422", () => {
  assertEquals(
    validatePaymentExchange({
      paymentCurrency: "USD",
      exchangeRate: Number.NaN,
    }).ok,
    false,
  );
  assertEquals(
    validatePaymentExchange({ paymentCurrency: "USD", exchangeRate: "abc" }).ok,
    false,
  );
});

Deno.test("validatePaymentExchange: USD con TC válido > 0 → ok", () => {
  assertEquals(
    validatePaymentExchange({ paymentCurrency: "USD", exchangeRate: 18.5 }),
    { ok: true },
  );
  assertEquals(
    validatePaymentExchange({ paymentCurrency: "EUR", exchangeRate: "21.3" }),
    { ok: true },
  );
});

// R9-02: el TC de la factura relacionada también se valida (EquivalenciaDR).
Deno.test("validateRelatedInvoiceExchange: factura USD TC=1 + pago MXN → bloqueo", () => {
  const r = validateRelatedInvoiceExchange({
    paymentCurrency: "MXN",
    invoiceCurrency: "USD",
    invoiceTipoCambio: 1,
  });
  assertEquals(r.ok, false);
});

Deno.test("validateRelatedInvoiceExchange: TC faltante/0/no numérico entre monedas distintas → bloqueo", () => {
  for (const tc of [null, undefined, 0, -3, "abc"]) {
    assertEquals(
      validateRelatedInvoiceExchange({
        paymentCurrency: "MXN",
        invoiceCurrency: "USD",
        invoiceTipoCambio: tc as never,
      }).ok,
      false,
    );
  }
});

Deno.test("validateRelatedInvoiceExchange: misma moneda conserva equivalencia 1", () => {
  assertEquals(
    validateRelatedInvoiceExchange({
      paymentCurrency: "USD",
      invoiceCurrency: "USD",
      invoiceTipoCambio: 1,
    }),
    { ok: true },
  );
  assertEquals(
    validateRelatedInvoiceExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "MXN",
      invoiceTipoCambio: null,
    }),
    { ok: true },
  );
});

Deno.test("validateRelatedInvoiceExchange: monedas distintas con TC válido → ok", () => {
  assertEquals(
    validateRelatedInvoiceExchange({
      paymentCurrency: "MXN",
      invoiceCurrency: "USD",
      invoiceTipoCambio: "18.9",
    }),
    { ok: true },
  );
});
