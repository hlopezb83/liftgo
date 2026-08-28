import { sumMoney, toMxn } from "@/lib/money";

export type PaymentLike = {
  amount: number;
  amount_mxn?: number | null;
  currency?: string | null;
  exchange_rate?: number | string | null;
};

function code(value: string | null | undefined): string {
  return (value ?? "MXN").toUpperCase();
}

function positiveRate(value: number | string | null | undefined): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Monto del pago en pesos, o `null` si no hay forma confiable de convertirlo. */
function paymentToMxn(p: PaymentLike): number | null {
  if (p.amount_mxn != null) return Number(p.amount_mxn);
  const amount = Number(p.amount ?? 0);
  const payCode = code(p.currency);
  if (payCode === "MXN") return amount;
  const rate = positiveRate(p.exchange_rate);
  return rate === null ? null : toMxn(amount, payCode, rate);
}

/**
 * FIX B6: el saldo de la factura sumaba `p.amount` en crudo. Un pago capturado
 * en otra moneda se descontaba 1:1 del total (como abonar 100 dólares y
 * restar 100 pesos), descuadrando el saldo sin ninguna advertencia.
 *
 * Aquí cada pago se normaliza a la moneda de la FACTURA: se lleva a pesos y,
 * si la factura está en divisa, se regresa con el tipo de cambio del documento.
 * Los pagos que no se pueden convertir se cuentan aparte para avisar al usuario
 * en vez de descuadrar el saldo en silencio.
 */
export function sumPaymentsInInvoiceCurrency(
  payments: ReadonlyArray<PaymentLike>,
  invoiceCurrency: string | null | undefined,
  invoiceRate: number | string | null | undefined,
): { totalPaid: number; unconvertible: number } {
  const invCode = code(invoiceCurrency);
  const invRate = positiveRate(invoiceRate);
  // E2: acumular con `sumMoney` (currency.js) y no con `+=` en float crudo —
  // un total exactamente cubierto devolvía saldos tipo -1.8e-13 y la UI pintaba
  // la factura como pendiente.
  const parts: number[] = [];
  let unconvertible = 0;

  for (const p of payments) {
    if (code(p.currency) === invCode) {
      parts.push(Number(p.amount ?? 0));
      continue;
    }
    const mxn = paymentToMxn(p);
    if (mxn === null) {
      unconvertible += 1;
    } else if (invCode === "MXN") {
      parts.push(mxn);
    } else if (invRate !== null) {
      parts.push(mxn / invRate);
    } else {
      unconvertible += 1;
    }
  }

  return { totalPaid: sumMoney(parts), unconvertible };
}
