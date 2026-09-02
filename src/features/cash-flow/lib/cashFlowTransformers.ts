/**
 * Transformadores puros para la proyección de flujo de efectivo.
 *
 * Aislados del cliente Supabase para poder testearse sin mocks y
 * mantener `useCashFlowProjection` reducido a orquestación de queries.
 */
import currency from "currency.js";
import { resolveVatRatePercent, toMxn } from "@/lib/money";
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
  // R7-08: TC = 1 en moneda foránea es el default del formulario/parser CFDI,
  // no un tipo de cambio capturado; tratarlo como válido sumaba USD 1:1.
  if (rate === 1) return true;
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

/** Reserva con facturación recurrente (2A-9). */
export interface RecurringBookingRow {
  id: string;
  booking_number: string;
  customer_name: string | null;
  start_date: string;
  end_date: string;
  last_billed_date: string | null;
  monthly_rate: number | string | null;
  currency: string | null;
  tipo_cambio: number | string | null;
  /** FIX-4 (ronda 2): tasa de IVA del cliente (null → 16%, 0 explícito se respeta). */
  customer_tax_rate?: number | string | null;
}


function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 2A-9: rentas recurrentes aún NO facturadas dentro del horizonte.
 * Sólo proyecta periodos mensuales completos posteriores al último facturado
 * y hasta el fin de la reserva; excluye monedas foráneas sin TC válido.
 * No crea reglas de negocio: es una estimación visual marcada como proyectada.
 */
function recurringBookingItemsFor(
  b: RecurringBookingRow,
  todayYmd: string,
  horizonEndYmd: string,
): CashFlowItem[] {
  if (isFxMissing(b.currency, b.tipo_cambio)) return [];
  const rate = Number(b.monthly_rate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return [];
  // FIX-4 (ronda 2): la proyección debe reflejar el TOTAL de la factura
  // (renta + IVA del cliente), no el neto: la Edge Function factura con
  // resolveVatRatePercent(customer.tax_rate).
  const vatRate = resolveVatRatePercent(b.customer_tax_rate ?? null);
  const gross = currency(rate, { precision: 2 }).multiply(1 + vatRate / 100).value;
  if (!Number.isFinite(gross) || gross <= 0) return [];
  const amountMxn = toMxn(gross, b.currency, b.tipo_cambio);
  if (!Number.isFinite(amountMxn) || amountMxn < MIN_PROJECTABLE_BALANCE_MXN) return [];

  const items: CashFlowItem[] = [];
  const anchor = b.last_billed_date && b.last_billed_date > b.start_date ? b.last_billed_date : b.start_date;
  for (let i = 1; i <= 24; i++) {
    const dueDate = addMonthsYmd(anchor, i);
    if (dueDate > horizonEndYmd || dueDate > b.end_date) break;
    if (dueDate < todayYmd) continue;
    items.push({
      id: `recurring:${b.id}:${dueDate}`,
      number: b.booking_number,
      partyName: b.customer_name ?? "—",
      dueDate,
      amountMxn,
      kind: "in",
      navigatePath: `/bookings/${b.id}`,
      isProjected: true,
    });
  }
  return items;
}

export function recurringBookingItems(
  bookings: ReadonlyArray<RecurringBookingRow>,
  todayYmd: string,
  horizonEndYmd: string,
): CashFlowItem[] {
  const items: CashFlowItem[] = [];
  for (const b of bookings) {
    items.push(...recurringBookingItemsFor(b, todayYmd, horizonEndYmd));
  }
  return items;
}
