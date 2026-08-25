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
}

/** ¿El pago tiene un complemento de pago timbrado y vigente? */
export function isRepBacked(payment: RepPaymentLike): boolean {
  return payment.rep_cfdi_status === "stamped" && !payment.rep_cancelled_at;
}

/** Suma de los pagos respaldados por un REP vigente. */
export function sumRepBackedPayments(payments: readonly RepPaymentLike[]): number {
  return sumMoney(payments.filter(isRepBacked).map((p) => Number(p.amount) || 0));
}

/** Pagos con REP vigente (los que hay que cancelar antes de acreditar de más). */
export function repBackedPayments<T extends RepPaymentLike>(payments: readonly T[]): T[] {
  return payments.filter(isRepBacked);
}
