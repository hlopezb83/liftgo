import { isFxMissing } from "@/features/cash-flow";
import { sumMoney, toMxn } from "@/lib/money";

/** Tolerancia monetaria del portal (menos de un centavo no es saldo). */
export const BALANCE_EPSILON = 0.009;

export interface StatementInvoiceLike {
  id: string;
  total: number | string;
  paid_amount?: number | string | null;
  credited_amount?: number | string | null;
  balance?: number | string | null;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
}

export interface StatementRow<I extends StatementInvoiceLike, P> {
  inv: I;
  payments: P[];
  paid: number;
  credited: number;
  balance: number;
  moneda: string;
  tipoCambio: number | string | null | undefined;
  /** R8-04: divisa sin tipo de cambio válido (nulo, <= 0 o exactamente 1). */
  fxMissing: boolean;
  /** `null` cuando no se puede convertir a pesos con certeza. */
  totalMxn: number | null;
  paidMxn: number | null;
  creditedMxn: number | null;
  balanceMxn: number | null;
}

/**
 * R8-04: construye las filas del estado de cuenta del portal.
 *
 * Antes, una factura en dólares sin tipo de cambio se sumaba 1:1 a los totales
 * en pesos (como cambiar dólares a la par). Ahora se marca `fxMissing`, se deja
 * fuera de los totales MXN y la UI avisa cuántas quedaron excluidas.
 */
export function buildStatementRows<I extends StatementInvoiceLike, P extends { invoice_id: string | null }>(
  invoices: ReadonlyArray<I> | undefined,
  payments: ReadonlyArray<P> | undefined,
): StatementRow<I, P>[] {
  return (invoices ?? []).map((inv) => {
    const invPayments = (payments ?? []).filter((p) => p.invoice_id === inv.id);
    const paid = Number(inv.paid_amount ?? 0);
    const credited = Number(inv.credited_amount ?? 0);
    const balance = Number(inv.balance ?? Math.max(Number(inv.total) - paid - credited, 0));
    const moneda = inv.moneda ?? "MXN";
    const tipoCambio = inv.tipo_cambio;
    const fxMissing = isFxMissing(moneda, tipoCambio);
    const conv = (n: number) => (fxMissing ? null : toMxn(n, moneda, tipoCambio ?? null));
    return {
      inv,
      payments: invPayments,
      paid,
      credited,
      balance,
      moneda,
      tipoCambio,
      fxMissing,
      totalMxn: conv(Number(inv.total)),
      paidMxn: conv(paid),
      creditedMxn: conv(credited),
      balanceMxn: conv(balance),
    };
  });
}

export interface StatementTotals {
  invoiced: number;
  paid: number;
  credited: number;
  balance: number;
  fxMissingCount: number;
}

/** Totales MXN excluyendo las filas sin tipo de cambio (y contándolas). */
export function sumStatementTotals(
  rows: ReadonlyArray<StatementRow<StatementInvoiceLike, unknown>>,
): StatementTotals {
  const usable = rows.filter((r) => !r.fxMissing);
  return {
    invoiced: sumMoney(usable.map((r) => r.totalMxn)),
    paid: sumMoney(usable.map((r) => r.paidMxn)),
    credited: sumMoney(usable.map((r) => r.creditedMxn)),
    balance: sumMoney(usable.map((r) => r.balanceMxn)),
    fxMissingCount: rows.length - usable.length,
  };
}

/**
 * Filtro "Solo con saldo": se basa en el saldo MXN cuando existe. Las filas sin
 * tipo de cambio caen a su saldo en moneda original para no desaparecer del
 * listado (el usuario debe verlas para pedir la corrección).
 */
export function filterWithBalance<R extends { balance: number; balanceMxn: number | null }>(
  rows: ReadonlyArray<R>,
): R[] {
  return rows.filter((r) => (r.balanceMxn ?? r.balance) > BALANCE_EPSILON);
}
