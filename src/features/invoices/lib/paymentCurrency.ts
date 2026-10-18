import { roundMoney, sumMoney } from "@/lib/money";

export type PaymentLike = {
  amount: number;
  currency?: string | null;
  exchange_rate?: number | string | null;
};

function code(value: string | null | undefined): string {
  return (value ?? "MXN").toUpperCase();
}

function conversionRate(currency: string, value: number | string | null | undefined): number | null {
  if (currency === "MXN") return 1;
  const n = Number(value ?? 0);
  // Misma regla que public.fx_is_missing: TC = 1 en divisa no es utilizable.
  return Number.isFinite(n) && n > 0 && n !== 1 ? n : null;
}

/**
 * Espejo cliente de public.fx_convert_amount: convierte directamente y redondea
 * una sola vez a centavos de la moneda destino. Devuelve null si falta un TC.
 * No redondear el paso intermedio a MXN ni sumar conversiones sin redondear.
 */
export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
  fromRate: number | string | null | undefined,
  toRate: number | string | null | undefined,
): number | null {
  if (!Number.isFinite(amount)) return null;
  const fromCode = code(fromCurrency);
  const toCode = code(toCurrency);
  if (fromCode === toCode) return roundMoney(amount);
  const sourceRate = conversionRate(fromCode, fromRate);
  const targetRate = conversionRate(toCode, toRate);
  if (sourceRate === null || targetRate === null) return null;
  return roundMoney(amount * sourceRate / targetRate);
}

/**
 * FIX B6: el saldo de la factura sumaba `p.amount` en crudo. Un pago capturado
 * en otra moneda se descontaba 1:1 del total (como abonar 100 dólares y
 * restar 100 pesos), descuadrando el saldo sin ninguna advertencia.
 *
 * Aquí cada pago se normaliza y redondea a la moneda de la FACTURA antes de
 * sumarse, como v_invoices_with_balance / fx_convert_amount. Un pago legado sin
 * moneda hereda la de la factura, también como la vista SQL.
 * Los pagos que no se pueden convertir se cuentan aparte para avisar al usuario
 * en vez de descuadrar el saldo en silencio.
 */
export function sumPaymentsInInvoiceCurrency(
  payments: ReadonlyArray<PaymentLike>,
  invoiceCurrency: string | null | undefined,
  invoiceRate: number | string | null | undefined,
): { totalPaid: number; unconvertible: number } {
  const invCode = code(invoiceCurrency);
  // E2: acumular con `sumMoney` (currency.js) y no con `+=` en float crudo —
  // un total exactamente cubierto devolvía saldos tipo -1.8e-13 y la UI pintaba
  // la factura como pendiente.
  const parts: number[] = [];
  let unconvertible = 0;

  for (const p of payments) {
    const converted = convertCurrencyAmount(
      Number(p.amount), p.currency ?? invCode, invCode, p.exchange_rate, invoiceRate,
    );
    if (converted === null) unconvertible += 1;
    else parts.push(converted);
  }

  return { totalPaid: sumMoney(parts), unconvertible };
}
