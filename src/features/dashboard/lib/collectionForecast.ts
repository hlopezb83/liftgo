import { toMxn } from "@/lib/money";

export interface InvoiceMxnLike {
  balance?: number | null;
  balance_mxn?: number | null;
  moneda?: string | null;
  tipo_cambio?: number | null;
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
 */
export function amountInMxn(inv: InvoiceMxnLike): number {
  if (inv.balance_mxn != null) return Number(inv.balance_mxn);
  const base = inv.balance != null ? Number(inv.balance) : Number(inv.total);
  return toMxn(base, inv.moneda ?? null, inv.tipo_cambio ?? null);
}
