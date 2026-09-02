/**
 * H-5: importe de una factura que ya está declarado ante el SAT mediante
 * complementos de pago (REP) timbrados y vigentes.
 *
 * Un REP declara un importe pagado contra la factura. Emitir una nota de
 * crédito que deje el neto por debajo de esa suma deja el CFDI inconsistente:
 * la secuencia correcta es cancelar el REP (la aceptación del SAT puede tardar
 * hasta 72 h) y después emitir la NC.
 *
 * Los pagos sin REP timbrado (facturas PUE, capturas internas) o con el REP ya
 * cancelado NO topan la NC: sólo generan saldo a favor del cliente.
 */
import { sumMoney } from "@/lib/money";

export interface RepPaymentLike {
  id?: string;
  amount: number | string | null;
  rep_cfdi_status?: string | null;
  rep_cancelled_at?: string | null;
  /** FIX-1 (ronda 2): moneda del pago; si falta se asume la de la factura. */
  currency?: string | null;
  /** Tipo de cambio del pago; si falta se usa el de la factura. */
  exchange_rate?: number | string | null;
}

/** ¿El pago tiene un complemento de pago timbrado y vigente? */
export function isRepBacked(payment: RepPaymentLike): boolean {
  return payment.rep_cfdi_status === "stamped" && !payment.rep_cancelled_at;
}

/**
 * FIX-1 (ronda 2): convierte el monto del pago a la moneda de la factura con
 * el CASE canónico de `sync_invoice_status`. Devuelve `null` cuando las
 * monedas difieren y no hay tipo de cambio disponible — el llamador debe
 * EXCLUIR el tope y avisar (fail-closed), nunca asumir 1:1.
 */
export function paymentAmountInInvoiceCurrency(
  payment: RepPaymentLike,
  invoiceMoneda: string | null | undefined,
  invoiceTipoCambio: number | string | null | undefined,
): number | null {
  const inv = (invoiceMoneda ?? "MXN").toUpperCase();
  const pay = (payment.currency ?? inv).toUpperCase();
  const amount = Number(payment.amount) || 0;
  if (pay === inv) return amount;
  const tc = Number(payment.exchange_rate ?? 0) || Number(invoiceTipoCambio ?? 0);
  if (!(Number.isFinite(tc) && tc > 0)) return null;
  const converted = pay === "MXN" ? amount / tc : amount * tc;
  return Math.round(converted * 100) / 100;
}

/** Suma de los pagos con REP vigente, ya en la moneda de la factura. */
export function sumRepBackedPaymentsInInvoiceCurrency(
  payments: readonly RepPaymentLike[],
  invoiceMoneda: string | null | undefined,
  invoiceTipoCambio: number | string | null | undefined,
): { total: number; fxMissing: number } {
  let fxMissing = 0;
  const amounts: number[] = [];
  for (const p of payments.filter(isRepBacked)) {
    const v = paymentAmountInInvoiceCurrency(p, invoiceMoneda, invoiceTipoCambio);
    if (v === null) {
      fxMissing++;
      continue;
    }
    amounts.push(v);
  }
  return { total: sumMoney(amounts), fxMissing };
}

/**
 * @deprecated FIX-1 (ronda 2): suma sin convertir divisa. Usar
 * `sumRepBackedPaymentsInInvoiceCurrency`. Se conserva para facturas en una
 * sola moneda y compatibilidad de importadores existentes.
 */
export function sumRepBackedPayments(payments: readonly RepPaymentLike[]): number {
  return sumMoney(payments.filter(isRepBacked).map((p) => Number(p.amount) || 0));
}


/** Pagos con REP vigente (los que hay que cancelar antes de acreditar de más). */
export function repBackedPayments<T extends RepPaymentLike>(payments: readonly T[]): T[] {
  return payments.filter(isRepBacked);
}
