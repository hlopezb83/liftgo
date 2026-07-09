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

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  total: number | string;
  due_date: string | null;
  customer_name: string | null;
  moneda: string | null;
  tipo_cambio: number | string | null;
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


/** Mapa de pagos acumulados (en MXN) agrupados por invoice_id. */
export function buildPaidByInvoice(payments: ReadonlyArray<PaymentRow>): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of payments) {
    const mxn = toMxn(Number(p.amount), p.currency, p.exchange_rate);
    map.set(p.invoice_id, (map.get(p.invoice_id) ?? 0) + mxn);
  }
  return map;
}

/** Transforma una factura en `CashFlowItem` (entrada), o null si no aplica. */
export function invoiceToItem(
  inv: InvoiceRow,
  paidByInvoice: ReadonlyMap<string, number>,
): CashFlowItem | null {
  if (!inv.due_date) return null;
  const totalMxn = toMxn(Number(inv.total), inv.moneda ?? "MXN", inv.tipo_cambio);
  const balance = totalMxn - (paidByInvoice.get(inv.id) ?? 0);
  if (balance <= 0.01) return null;
  return {
    id: inv.id,
    number: inv.invoice_number,
    partyName: inv.customer_name ?? "—",
    dueDate: inv.due_date,
    amountMxn: balance,
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
  const balanceMxn = toMxn(Number(b.balance), b.currency, b.exchange_rate);
  if (balanceMxn <= 0.01) return null;
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
