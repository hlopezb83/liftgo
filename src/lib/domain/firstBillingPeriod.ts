import currency from "currency.js";
import { toYMD } from "@/lib/date/toYMD";
import { parseDateLocal } from "@/lib/utils";

/**
 * Primer ciclo de facturación de una reserva de largo plazo.
 *
 * Regla de negocio: cuando una reserva cubre más de un mes (p. ej. 1 año), la
 * PRIMERA factura cubre únicamente del inicio de la reserva al último día de
 * ese mes (prorrateada por días); a partir del mes siguiente se factura el mes
 * completo. Es la misma convención que ya aplica el motor de facturación
 * recurrente (`generate-recurring-invoices/prorate.ts`); este helper la
 * reproduce del lado del cliente para el prellenado de facturas manuales.
 */
export interface FirstBillingPeriod {
  /** Inicio del periodo (YYYY-MM-DD) = inicio de la reserva. */
  start: string;
  /** Fin del periodo (YYYY-MM-DD) = último día del mes de inicio. */
  end: string;
  /** Días facturables (fin inclusivo). */
  billedDays: number;
  /** Días totales del mes de inicio. */
  daysInMonth: number;
  /** true cuando la reserva NO arranca el día 1 (hay prorrateo). */
  isProrated: boolean;
  /** true cuando la reserva se extiende más allá del mes de inicio. */
  truncated: boolean;
}

export function firstBillingPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): FirstBillingPeriod | null {
  const start = parseDateLocal(startDate);
  if (!start) return null;
  const monthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const end = parseDateLocal(endDate);
  const truncated = !!end && end > monthEnd;
  const effectiveEnd = truncated ? monthEnd : (end ?? monthEnd);
  const billedDays = effectiveEnd.getDate() - start.getDate() + 1;
  return {
    start: toYMD(start),
    end: toYMD(effectiveEnd),
    billedDays: Math.max(0, billedDays),
    daysInMonth,
    isProrated: start.getDate() !== 1,
    truncated,
  };
}

export interface ProratedLineAmounts {
  /** Días facturados = cantidad de la partida. */
  quantity: number;
  /** Precio diario derivado de la renta mensual (hasta 6 decimales, CFDI 4.0). */
  unitPrice: number;
  /** Importe de la partida = quantity × unitPrice redondeado a centavos. */
  total: number;
}

/**
 * Desglose de la primera factura por DÍAS al precio diario derivado de la renta
 * mensual (renta / días del mes). Se mantiene la invariante timbrable
 * `total = quantity × unitPrice` (redondeada a centavos), quedando a lo sumo un
 * centavo del prorrateo mensual exacto que aplica el motor recurrente.
 */
export function prorateMonthlyLine(
  monthlyRate: number,
  billedDays: number,
  daysInMonth: number,
): ProratedLineAmounts | null {
  if (!(monthlyRate > 0) || !(daysInMonth > 0) || billedDays <= 0) return null;
  const quantity = Math.min(billedDays, daysInMonth);
  const unitPrice = Math.round((monthlyRate / daysInMonth) * 1e6) / 1e6;
  const total = currency(unitPrice * quantity).value;
  return { quantity, unitPrice, total };
}
