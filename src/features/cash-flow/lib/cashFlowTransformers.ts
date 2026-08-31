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
  /**
   * A2-1: saldo canónico ya convertido a MXN por `v_invoices_with_balance`
   * (pagos en otra moneda convertidos con el TC del pago o del documento,
   * NCs timbradas descontadas). `null` cuando falta el TC de una factura
   * en moneda foránea.
   */
  balance_mxn?: number | string | null;
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
 * A2-1 (auditoría QA): DEPRECADO para el cash flow. Sumaba `p.amount` crudo
 * asumiendo que el pago siempre viene en la moneda de la factura, lo cual la
 * base de datos NO garantiza (`trg_payments_currency_matches_invoice` admite
 * cruce con tipo de cambio). Un pago de $850 MXN a una factura USD contaba
 * como 850 USD y subestimaba (o desaparecía) el saldo proyectado.
 *
 * El saldo canónico ahora viene de `v_invoices_with_balance.balance_mxn`.
 * Se conserva sólo por retro-compatibilidad de importadores externos.
 */
export function buildPaidByInvoice(payments: ReadonlyArray<PaymentRow>): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + Number(p.amount));
  }
  return map;
}

/**
 * Saldo mínimo proyectable (MXN): medio centavo. Saldos residuales por debajo
 * son ruido de redondeo de centavos/TC y no ameritan fila en la proyección.
 * Único umbral para entradas (facturas) y salidas (bills).
 */
const MIN_PROJECTABLE_BALANCE_MXN = 0.005;

/** Transforma una factura en `CashFlowItem` (entrada), o null si no aplica. */
export function invoiceToItem(inv: InvoiceRow): CashFlowItem | null {
  if (!inv.due_date) return null;
  // FX faltante → excluir de la proyección en vez de asumir USD 1:1 como MXN.
  if (isFxMissing(inv.moneda, inv.tipo_cambio)) return null;
  // A2-1: el saldo lo calcula `v_invoices_with_balance` (misma definición que
  // usan cobranza y el portal): total − pagos convertidos a moneda del
  // documento − NCs timbradas, y luego a MXN con el TC del documento.
  // Antes se recalculaba en el cliente sumando `payments.amount` crudo, lo que
  // subestimaba el saldo cuando el pago venía en otra moneda.
  const raw = inv.balance_mxn;
  if (raw === null || raw === undefined) return null;
  const balanceMxn = Number(raw);
  if (!Number.isFinite(balanceMxn) || balanceMxn < MIN_PROJECTABLE_BALANCE_MXN) return null;
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
  if (!Number.isFinite(balanceMxn) || balanceMxn < MIN_PROJECTABLE_BALANCE_MXN) return null;
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
