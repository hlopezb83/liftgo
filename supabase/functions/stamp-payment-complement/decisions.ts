// TESTS-ARQ2 v2 · DIFF 9: decisión pura por bloque del stamp-payment-complement.
// Anexo 20 del SAT exige `EquivalenciaDR=1` cuando la moneda del documento
// relacionado (factura origen) coincide con la moneda del pago, aun si la
// factura tiene `tipo_cambio` guardado ≠ 1. Antes del fix R10-8.2 el REP
// enviaba el TC de la factura y Facturapi lo rechazaba con CFDI40230.
//
// Este helper se importa desde index.ts y desde el test, de modo que el fix
// no puede regresar sin romper el suite.

export interface RepExchangeInput {
  paymentCurrency: string | null | undefined;
  invoiceCurrency: string | null | undefined;
  invoiceTipoCambio: number | string | null | undefined;
}

export function computeRepExchange(input: RepExchangeInput): {
  invoiceCurrency: string;
  invoiceExchange: number;
} {
  const paymentCurrency = (input.paymentCurrency ?? "MXN").toUpperCase();
  const invoiceCurrency = (input.invoiceCurrency ?? "MXN").toUpperCase();
  if (invoiceCurrency === paymentCurrency) {
    return { invoiceCurrency, invoiceExchange: 1 };
  }
  const rate = Number(input.invoiceTipoCambio ?? 1);
  const invoiceExchange = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return { invoiceCurrency, invoiceExchange };
}
