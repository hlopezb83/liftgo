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

// TESTS-ARQ2 v3 · DIFF 9 residual: contrato Anexo 20 de parcialidades.
// La lógica real vive en el RPC `prepare_payment_complement` (FOR UPDATE +
// cálculo transaccional) porque debe ser serializable. Este helper es el
// espejo puro del invariante y sirve como documentación ejecutable + guard
// de regresión: si alguien cambia el SQL sin actualizar estos tests, o
// viceversa, la doble fuente diverge y el suite falla.
//
// Anexo 20:
//  - NumParcialidad = cantidad de REP previos exitosos + 1
//  - ImpSaldoAnt    = total_factura - Σ pagos previos (redondeo a 2 decimales)
//  - ImpSaldoInsoluto = ImpSaldoAnt - importe_de_este_pago
//  - Si ImpSaldoInsoluto < 0 (con tolerancia de 1 centavo) → pago excede saldo.
export interface InstallmentMetaInput {
  previousPayments: readonly { amount: number }[];
  invoiceTotal: number;
  thisAmount: number;
}

export interface InstallmentMeta {
  numParcialidad: number;
  impSaldoAnt: number;
  impSaldoInsoluto: number;
}

export function computeInstallmentMeta(
  input: InstallmentMetaInput,
): InstallmentMeta {
  const total = Number(input.invoiceTotal);
  const paying = Number(input.thisAmount);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("invoice_total_invalid");
  }
  if (!Number.isFinite(paying) || paying <= 0) {
    throw new Error("payment_amount_invalid");
  }
  const sumPrev = input.previousPayments.reduce((acc, p) => {
    const n = Number(p.amount);
    return acc + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const numParcialidad = input.previousPayments.length + 1;
  const impSaldoAnt = Number((total - sumPrev).toFixed(2));
  const impSaldoInsoluto = Number((impSaldoAnt - paying).toFixed(2));
  // Tolerancia de 1 centavo por redondeo Anexo 20.
  if (impSaldoInsoluto < -0.01) {
    throw new Error("payment_exceeds_balance");
  }
  return { numParcialidad, impSaldoAnt, impSaldoInsoluto };
}
