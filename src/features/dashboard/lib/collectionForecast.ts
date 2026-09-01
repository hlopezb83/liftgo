import { toMxn } from "@/lib/money";

export interface InvoiceMxnLike {
  balance?: number | null;
  balance_mxn?: number | null;
  moneda?: string | null;
  tipo_cambio?: number | null;
  /** H-2: documento en divisa sin tipo de cambio capturado. */
  fx_missing?: boolean | null;
  total: number;
}

/**
 * v7.226.1 · extraído de CollectionForecast para no romper Fast Refresh
 * (el archivo del componente sólo debe exportar componentes).
 *
 * Devuelve el saldo en MXN. Prioriza `balance_mxn` (calculado en la vista
 * `v_invoices_with_balance`). Si no está, convierte `balance` con
 * `tipo_cambio` y cae al `total` como último recurso. BL-1.1 R5: evita
 * sumar USD como si fueran MXN.
 *
 * H-2: si el documento está en divisa y no tiene tipo de cambio, devuelve 0
 * (se excluye del agregado) en vez de sumar la cifra cruda 1:1.
 */
export function amountInMxn(inv: InvoiceMxnLike): number {
  if (isFxMissing(inv)) return 0;
  if (inv.balance_mxn != null) return Number(inv.balance_mxn);
  const base = inv.balance != null ? Number(inv.balance) : Number(inv.total);
  return toMxn(base, inv.moneda ?? null, inv.tipo_cambio ?? null);
}

/** H-2: true cuando el documento está en divisa sin tipo de cambio usable. */
export function isFxMissing(inv: InvoiceMxnLike): boolean {
  if (inv.fx_missing === true) return true;
  const code = (inv.moneda ?? "MXN").toUpperCase();
  if (code === "MXN") return false;
  const rate = Number(inv.tipo_cambio ?? 0);
  // R7-08: TC = 1 en moneda foránea no es un tipo de cambio real.
  if (rate === 1) return true;
  return !(Number.isFinite(rate) && rate > 0);
}

/** H-2: cuántos documentos quedaron fuera del agregado por falta de TC. */
export function countFxMissing(invoices: ReadonlyArray<InvoiceMxnLike>): number {
  return invoices.reduce((n, inv) => (isFxMissing(inv) ? n + 1 : n), 0);
}

