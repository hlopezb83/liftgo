import { monthBounds } from "@/lib/date/monthBounds";
import { firstBillingPeriod } from "@/lib/domain/firstBillingPeriod";
import { formatDateRange } from "@/lib/utils";

/**
 * Reglas de compatibilidad para agrupar varias reservas en UNA factura y
 * validación cliente del periodo (espejo del guard de servidor en
 * `sync_invoice_bookings`). Regresión v7.423.0 (Problemas 2 y 3):
 * - La factura tiene UN solo periodo global; agrupar reservas con periodos
 *   canónicos distintos dejaba a las secundarias ligadas a metadatos de
 *   periodo incorrectos.
 * - La moneda/TC se heredan de la primera reserva; mezclar monedas facturaría
 *   importes de otra divisa sin conversión (y no convertimos automáticamente).
 * Esto es presentación/validación: la autoridad final es el RPC transaccional
 * `save_invoice_with_bookings` → `sync_invoice_bookings` en la base de datos.
 */

export interface BillableBooking {
  id: string;
  customer_id?: string | null;
  start_date: string;
  end_date: string;
  recurring_billing?: boolean | null;
  currency?: string | null;
  tipo_cambio?: number | string | null;
}

/**
 * H-6 / Bug 4: periodo pre-llenado al ligar una reserva (regla canónica).
 * - No recurrente → exactamente el rango de la reserva.
 * - Recurrente → primer ciclo (inicio de reserva → fin de ese mes, o fin de la
 *   reserva si termina antes).
 * - Sin reserva o fechas inválidas → mes de la fecha de emisión (fallback;
 *   con reserva el servidor rechaza cualquier periodo fuera de su rango).
 */
export function prefillBillingPeriod(
  booking: Pick<BillableBooking, "start_date" | "end_date" | "recurring_billing"> | undefined,
  issueDate: Date,
): { start: string; end: string } {
  if (booking && !booking.recurring_billing) {
    return { start: booking.start_date, end: booking.end_date };
  }
  const first = booking ? firstBillingPeriod(booking.start_date, booking.end_date) : null;
  if (first) return { start: first.start, end: first.end };
  return monthBounds(issueDate);
}

const normalizeCurrency = (c: string | null | undefined): string =>
  c && c.trim() ? c.trim().toUpperCase() : "MXN";

const normalizeFx = (v: number | string | null | undefined): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Razón breve (es-MX) por la que `candidate` NO puede facturarse junto a
 * `first`; `null` si son compatibles. Reglas: mismo cliente, misma moneda,
 * mismo tipo de cambio (para moneda extranjera) y exactamente el mismo
 * periodo facturable canónico (`prefillBillingPeriod`/`firstBillingPeriod`).
 */
export function bookingIncompatibilityReason(
  first: BillableBooking,
  candidate: BillableBooking,
  issueDate: Date,
): string | null {
  if ((first.customer_id ?? null) !== (candidate.customer_id ?? null)) {
    return "cliente distinto";
  }
  const c1 = normalizeCurrency(first.currency);
  const c2 = normalizeCurrency(candidate.currency);
  if (c1 !== c2) return `moneda distinta (${c2} vs ${c1})`;
  if (c1 !== "MXN") {
    const f1 = normalizeFx(first.tipo_cambio);
    const f2 = normalizeFx(candidate.tipo_cambio);
    if (f1 !== f2) {
      return `tipo de cambio distinto (${f2 ?? "sin capturar"} vs ${f1 ?? "sin capturar"})`;
    }
  }
  const p1 = prefillBillingPeriod(first, issueDate);
  const p2 = prefillBillingPeriod(candidate, issueDate);
  if (p1.start !== p2.start || p1.end !== p2.end) {
    return `periodo facturable distinto (${formatDateRange(p2.start, p2.end)})`;
  }
  return null;
}

/**
 * Valida la selección completa al momento de guardar — no depende del filtro
 * visual del selector. Devuelve mensaje de error o `null` si todas las
 * reservas son compatibles entre sí.
 */
export function validateBookingSelection(
  selected: BillableBooking[],
  issueDate: Date,
): string | null {
  if (selected.length < 2) return null;
  const [first, ...rest] = selected;
  for (const candidate of rest) {
    const reason = bookingIncompatibilityReason(first, candidate, issueDate);
    if (reason) {
      return `No se pueden facturar juntas estas reservas: ${reason}. Sepáralas en facturas distintas.`;
    }
  }
  return null;
}

/**
 * Espejo cliente del guard de servidor (`sync_invoice_bookings`): el periodo
 * capturado debe ser válido (inicio ≤ fin) y caber dentro del rango de TODAS
 * las reservas seleccionadas. Comparación lexicográfica, segura en YYYY-MM-DD.
 */
export function periodOutsideBookingsError(
  selected: BillableBooking[],
  start: string,
  end: string,
): string | null {
  if (selected.length === 0) return null;
  if (!start || !end) return "El periodo de facturación debe tener inicio y fin.";
  if (start > end) return "El fin del periodo no puede ser anterior al inicio.";
  for (const b of selected) {
    if (start < b.start_date || end > b.end_date) {
      return `El periodo ${formatDateRange(start, end)} queda fuera del rango de la reserva (${formatDateRange(b.start_date, b.end_date)}).`;
    }
  }
  return null;
}
