import { differenceInCalendarDays, parseISO, startOfMonth } from "date-fns";
import { toYMD } from "@/lib/date/toYMD";
import { toMxn } from "@/lib/money";

/** Reserva mínima requerida para el drill-down de utilización. */
export interface DrilldownBooking {
  id: string;
  booking_number: string;
  customer_name: string | null;
  forklift_id: string;
  start_date: string;
  end_date: string;
  status: string;
}

export interface ClampedBooking extends DrilldownBooking {
  /** Inicio recortado al rango del reporte (YYYY-MM-DD). */
  clampedStart: string;
  /** Fin recortado al rango del reporte (YYYY-MM-DD). */
  clampedEnd: string;
  /** Días calendario inclusivos dentro del rango. */
  daysInRange: number;
}

function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Recorta una reserva al rango del reporte. Devuelve null si no traslapa. */
export function clampBookingToRange(
  booking: DrilldownBooking,
  rangeStart: Date,
  rangeEnd: Date,
): ClampedBooking | null {
  const bs = dayStart(parseISO(booking.start_date));
  const be = dayStart(parseISO(booking.end_date));
  const rs = dayStart(rangeStart);
  const re = dayStart(rangeEnd);
  const start = bs > rs ? bs : rs;
  const end = be < re ? be : re;
  if (end < start) return null;
  return {
    ...booking,
    clampedStart: toYMD(start),
    clampedEnd: toYMD(end),
    daysInRange: differenceInCalendarDays(end, start) + 1,
  };
}

/** Reservas de un montacargas que componen sus días reservados en el rango. */
export function bookingsForForkliftInRange(
  bookings: DrilldownBooking[],
  forkliftId: string,
  rangeStart: Date,
  rangeEnd: Date,
): ClampedBooking[] {
  return bookings
    .filter((b) => b.forklift_id === forkliftId && b.status !== "cancelled")
    .map((b) => clampBookingToRange(b, rangeStart, rangeEnd))
    .filter((b): b is ClampedBooking => b !== null)
    .sort((a, b) => a.clampedStart.localeCompare(b.clampedStart));
}

/** true si al menos dos reservas comparten días (los días se cuentan una sola vez). */
export function hasOverlappingBookings(list: ClampedBooking[]): boolean {
  const sorted = [...list].sort((a, b) => a.clampedStart.localeCompare(b.clampedStart));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].clampedStart <= sorted[i - 1].clampedEnd) return true;
  }
  return false;
}

/** Factura mínima requerida para el drill-down de ingresos. */
export interface DrilldownInvoice {
  id: string;
  invoice_number: string;
  customer_name?: string | null;
  issued_at: string;
  total: number | string;
  status: string;
  moneda?: string | null;
  tipo_cambio?: number | string | null;
}

/** Total de la factura normalizado a MXN. */
export function invoiceTotalMxn(inv: DrilldownInvoice): number {
  return toMxn(Number(inv.total), inv.moneda ?? "MXN", inv.tipo_cambio);
}

/** Clave de mes "YYYY-MM" de la fecha de emisión. */
export function invoiceMonthKey(inv: DrilldownInvoice): string {
  return toYMD(startOfMonth(parseISO(inv.issued_at))).slice(0, 7);
}

/**
 * Facturas que componen el total facturado de un mes.
 * Excluye borradores y canceladas (mismo criterio que el reporte de ingresos).
 */
export function invoicesForMonth(
  invoices: DrilldownInvoice[],
  monthKey: string,
): DrilldownInvoice[] {
  return invoices
    .filter((i) => i.status !== "draft" && i.status !== "cancelled" && invoiceMonthKey(i) === monthKey)
    .sort((a, b) => invoiceTotalMxn(b) - invoiceTotalMxn(a));
}
