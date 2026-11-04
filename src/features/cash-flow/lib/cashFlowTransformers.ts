/**
 * Transformadores puros para la proyección de flujo de efectivo.
 *
 * Aislados del cliente Supabase para poder testearse sin mocks y
 * mantener `useCashFlowProjection` reducido a orquestación de queries.
 */
import currency from "currency.js";
import { isFxMissing, resolveVatRatePercent, toMxn } from "@/lib/money";
import type { CashFlowItem } from "./cashFlowUtils";

// Re-export para preservar retro-compatibilidad con importadores existentes.
// La implementación canónica vive en `@/lib/money`.
export { toMxn };

// Canonical predicate is shared by financial aggregates.
export { isFxMissing } from "@/lib/money";

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
  /** Authoritative active invoice periods, including direct and pivot links. */
  billing_coverage?: Array<{ periodStart: string | null; periodEnd: string | null }>;
  monthly_rate: number | string | null;
  currency: string | null;
  tipo_cambio: number | string | null;
  /** FIX-4 (ronda 2): tasa de IVA del cliente (null → 16%, 0 explícito se respeta). */
  customer_tax_rate?: number | string | null;
}


function toYmdUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function firstOfNextMonthYmd(ymd: string): string {
  const [year, month] = ymd.split("-").map(Number);
  return toYmdUtc(new Date(Date.UTC(year, month, 1)));
}

function lastOfMonthYmd(ymd: string): string {
  const [year, month] = ymd.split("-").map(Number);
  return toYmdUtc(new Date(Date.UTC(year, month, 0)));
}

/**
 * 2A-9: rentas recurrentes aún NO facturadas dentro del horizonte.
 * Usa los mismos periodos calendario y prorrateo en centavos que
 * `generate-recurring-invoices`; excluye monedas foráneas sin TC válido.
 * No crea reglas de negocio: es una estimación visual marcada como proyectada.
 */
function recurringGrossMxn(
  b: RecurringBookingRow,
  billedDays: number,
  daysInMonth: number,
): number | null {
  if (isFxMissing(b.currency, b.tipo_cambio)) return null;
  const rate = Number(b.monthly_rate ?? 0);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  // FIX-4 (ronda 2): la proyección debe reflejar el TOTAL de la factura
  // (renta + IVA del cliente), no el neto: la Edge Function factura con
  // resolveVatRatePercent(customer.tax_rate).
  const vatRate = resolveVatRatePercent(b.customer_tax_rate ?? null);
  // Paridad con computeProrate + sumLineTaxCents del generador: primero se
  // redondea el periodo a centavos y luego el IVA de esa línea.
  const subtotal = currency(rate, { precision: 2 })
    .multiply(billedDays)
    .divide(daysInMonth).value;
  const tax = currency(subtotal, { precision: 2 })
    .multiply(vatRate)
    .divide(100).value;
  const gross = currency(subtotal, { precision: 2 }).add(tax).value;
  if (!Number.isFinite(gross) || gross <= 0) return null;
  const amountMxn = toMxn(gross, b.currency, b.tipo_cambio);
  if (!Number.isFinite(amountMxn) || amountMxn < MIN_PROJECTABLE_BALANCE_MXN) return null;
  return amountMxn;
}

function recurringBookingItemsFor(
  b: RecurringBookingRow,
  todayYmd: string,
  horizonEndYmd: string,
): CashFlowItem[] {
  const items: CashFlowItem[] = [];
  // A future invoice does not prove that the preceding months were billed.
  // Do not fall back to last_billed_date when the upgraded RPC is unavailable.
  const coverage = b.billing_coverage?.filter(isValidCoveragePeriod);
  if (!coverage || coverage.length !== b.billing_coverage?.length) return items;
  // The projection only needs the current month onward. Jumping to that
  // month keeps old bookings from exhausting the bounded horizon loop.
  const currentMonthStart = `${todayYmd.slice(0, 7)}-01`;
  let periodStart = b.start_date > currentMonthStart ? b.start_date : currentMonthStart;

  for (let i = 0; i < 24; i++) {
    if (periodStart > b.end_date) break;

    const monthEnd = lastOfMonthYmd(periodStart);
    const dueDate = monthEnd < b.end_date ? monthEnd : b.end_date;
    if (dueDate > horizonEndYmd) break;

    const daysInMonth = Number(monthEnd.slice(8, 10));
    const billedDays = Number(dueDate.slice(8, 10)) - Number(periodStart.slice(8, 10)) + 1;
    const amountMxn = recurringGrossMxn(b, billedDays, daysInMonth);
    if (amountMxn === null) return [];
    // Never double-count a period occupied by an active draft or invoice.
    // Partial/unknown coverage is not guessed; the page reports its exclusion.
    const occupied = coverage.some((period) =>
      period.periodStart <= dueDate && period.periodEnd >= periodStart);
    if (dueDate >= todayYmd && !occupied) {
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

    if (dueDate >= b.end_date) break;
    periodStart = firstOfNextMonthYmd(periodStart);
  }
  return items;
}

function validCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidCoveragePeriod(period: { periodStart: string | null; periodEnd: string | null }): period is { periodStart: string; periodEnd: string } {
  return validCalendarDate(period.periodStart) && validCalendarDate(period.periodEnd)
    && period.periodStart <= period.periodEnd;
}

function mergeCoveragePeriods(periods: Array<{ periodStart: string; periodEnd: string }>): Array<{ periodStart: string; periodEnd: string }> {
  const merged: Array<{ periodStart: string; periodEnd: string }> = [];
  for (const period of [...periods].sort((a, b) => a.periodStart.localeCompare(b.periodStart))) {
    const previous = merged.at(-1);
    const adjacentEnd = previous && toYmdUtc(new Date(Date.parse(`${previous.periodEnd}T00:00:00Z`) + 86_400_000));
    if (previous && adjacentEnd && period.periodStart <= adjacentEnd) {
      if (period.periodEnd > previous.periodEnd) previous.periodEnd = period.periodEnd;
    } else merged.push({ ...period });
  }
  return merged;
}

/** Reservations excluded or partially omitted because their coverage is unclear. */
export function recurringCoverageReviewCount(bookings: ReadonlyArray<RecurringBookingRow>): number {
  return bookings.filter((booking) => {
    const coverage = booking.billing_coverage;
    if (!coverage) return true;
    const validCoverage = coverage.filter(isValidCoveragePeriod);
    if (validCoverage.length !== coverage.length) return true;
    return mergeCoveragePeriods(validCoverage).some((period) => {
      const start = period.periodStart;
      const end = period.periodEnd;
      const expectedStart = booking.start_date.slice(0, 7) === start.slice(0, 7)
        ? booking.start_date : `${start.slice(0, 7)}-01`;
      const monthEnd = lastOfMonthYmd(end);
      const expectedEnd = monthEnd < booking.end_date ? monthEnd : booking.end_date;
      return start < booking.start_date || end > booking.end_date
        || start !== expectedStart || end !== expectedEnd;
    });
  }).length;
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
