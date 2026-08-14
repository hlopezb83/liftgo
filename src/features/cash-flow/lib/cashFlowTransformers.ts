/**
 * Transformadores puros para la proyección de flujo de efectivo.
 *
 * Aislados del cliente Supabase para poder testearse sin mocks y
 * mantener `useCashFlowProjection` reducido a orquestación de queries.
 */
import { toMxn } from "@/lib/money";
import type { CashFlowItem } from "./cashFlowUtils";

// Re-export para preservar retro-compatibilidad con importadores existentes.
// La implementación canónica vive en `@/lib/money`.
export { toMxn };

/**
 * FX faltante: moneda foránea sin tipo de cambio válido (> 0, finito).
 * toMxn en ese caso devuelve el monto SIN convertir (1:1) — proyectarlo sería
 * una subestimación silenciosa (~18× para USD). El cash-flow EXCLUYE estos
 * documentos; el consumidor puede listarlos con este helper para avisar.
 */
export function isFxMissing(
  currency: string | null | undefined,
  fx: number | string | null | undefined,
): boolean {
  const code = (currency ?? "MXN").toUpperCase();
  if (code === "MXN") return false;
  const rate = Number(fx ?? 0);
  return !(Number.isFinite(rate) && rate > 0);
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  total: number | string;
  due_date: string | null;
  customer_name: string | null;
  moneda: string | null;
  tipo_cambio: number | string | null;
  /** v7.209.0 A4: NCs timbradas restadas por la vista `v_invoices_with_balance`. */
  credited_amount?: number | string | null;
}

export interface BillRow {
  id: string;
  bill_number: string;
  balance: number | string;
  due_date: string | null;
  currency: string | null;
  exchange_rate: number | string | null;
  suppliers: { name: string } | { name: string }[] | null;
}

export interface PaymentRow {
  invoice_id: string;
  amount: number | string;
  currency: string | null;
  exchange_rate: number | string | null;
}


/**
 * Mapa de pagos acumulados EN MONEDA DEL DOCUMENTO (no MXN), agrupados por
 * invoice_id. El Fix 3.2 garantiza que un pago se registra en la misma
 * moneda que la factura, así que sumamos el monto crudo sin convertir:
 * convertir cada pago a MXN con su propio TC y luego restar del total en MXN
 * mezclaba tipos de cambio distintos y producía saldos irreales (Fix 6.4).
 */
export function buildPaidByInvoice(payments: ReadonlyArray<PaymentRow>): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount));
  }
  return map;
}

/** Transforma una factura en `CashFlowItem` (entrada), o null si no aplica. */
export function invoiceToItem(
  inv: InvoiceRow,
  paidByInvoice: ReadonlyMap<string, number>,
): CashFlowItem | null {
  if (!inv.due_date) return null;
  // FX faltante → excluir de la proyección en vez de asumir USD 1:1 como MXN.
  if (isFxMissing(inv.moneda, inv.tipo_cambio)) return null;
  // Fix 6.4: el saldo se calcula EN MONEDA DEL DOCUMENTO (total - pagos -
  // NCs, todos ya en esa moneda) y solo el residual se convierte a MXN con
  // el TC del documento. Antes se convertía cada pieza por separado a MXN
  // con su propio TC, mezclando tipos de cambio distintos.
  const paidDoc = paidByInvoice.get(inv.id) ?? 0;
  const creditedDoc = Number(inv.credited_amount ?? 0);
  const balanceDoc = Number(inv.total) - paidDoc - creditedDoc;
  const balanceMxn = toMxn(balanceDoc, inv.moneda ?? "MXN", inv.tipo_cambio);
  if (balanceMxn < 0.005) return null;
  return {
    id: inv.id,
    number: inv.invoice_number,
    partyName: inv.customer_name ?? "—",
    dueDate: inv.due_date,
    amountMxn: balanceMxn,
    kind: "in",
    navigatePath: `/invoices/${inv.id}`,
  };
}

function supplierName(s: BillRow["suppliers"]): string {
  if (!s) return "—";
  if (Array.isArray(s)) return s[0]?.name ?? "—";
  return s.name ?? "—";
}

/** Transforma una cuenta por pagar en `CashFlowItem` (salida), o null. */
export function billToItem(b: BillRow): CashFlowItem | null {
  if (!b.due_date) return null;
  if (isFxMissing(b.currency, b.exchange_rate)) return null;
  // Bloque 5.3 (R4): balance null/NaN generaba "$NaN" en la tabla. Coalescemos
  // a 0 antes de convertir a MXN — si queda ≤ 0.01 se descarta con el guard.
  const rawBalance = Number(b.balance);
  const safeBalance = Number.isFinite(rawBalance) ? rawBalance : 0;
  const balanceMxn = toMxn(safeBalance, b.currency, b.exchange_rate);
  if (!Number.isFinite(balanceMxn) || balanceMxn < 0.005) return null;
  return {
    id: b.id,
    number: b.bill_number,
    partyName: supplierName(b.suppliers),
    dueDate: b.due_date,
    amountMxn: balanceMxn,
    kind: "out",
    navigatePath: `/cuentas-por-pagar?bill=${b.id}`,
  };
}
