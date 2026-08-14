import { addDays, differenceInCalendarDays } from "date-fns";
import { calculateRentalCost, type LineItem } from "@/lib/domain/invoiceHelpers";
import { toYMD } from "@/lib/date/toYMD";

/**
 * Facturación de extensiones de reserva (v7.307.0).
 *
 * Cuando una reserva de renta corta se extiende, el período original ya quedó
 * facturado. Lo cobrable es SÓLO el tramo nuevo:
 *   `original_end_date + 1` … `new_end_date`
 * (el fin es inclusivo, misma convención que `rentalDaysInclusive`).
 *
 * En reservas con facturación recurrente mensual esto NO aplica: el motor
 * mensual ya cubre los días extra dentro de la mensualidad correspondiente.
 */

/** Tarifas efectivas del tramo: se prefiere la pactada en la reserva. */
export interface ExtensionRates {
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
}

export interface ExtensionBillableRange {
  /** Primer día cobrable (YYYY-MM-DD). */
  start: string;
  /** Último día cobrable, inclusivo (YYYY-MM-DD). */
  end: string;
  /** Días cobrables (fin inclusivo). */
  days: number;
}

/** Ancla la fecha al mediodía local: evita el corrimiento de día por timezone. */
function parseYmdNoon(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T12:00:00`);
  return new Date(input);
}

/**
 * Tramo cobrable de una extensión. Devuelve `null` cuando la extensión no
 * agrega días (o los resta, p. ej. una corrección hacia atrás).
 */
export function extensionBillableRange(
  originalEndDate: string,
  newEndDate: string,
): ExtensionBillableRange | null {
  const start = addDays(parseYmdNoon(originalEndDate), 1);
  const end = parseYmdNoon(newEndDate);
  const days = differenceInCalendarDays(end, start) + 1;
  if (days <= 0) return null;
  const startStr = toYMD(start);
  const endStr = toYMD(end);
  if (!startStr || !endStr) return null;
  return { start: startStr, end: endStr, days };
}

export interface ExtensionLineItemsInput {
  originalEndDate: string;
  newEndDate: string;
  /** Tarifas del equipo (maestras). */
  forkliftRates: ExtensionRates;
  /** Tarifa mensual pactada en la reserva; gana sobre la maestra si es > 0. */
  bookingMonthlyRate?: number | null;
  forkliftName?: string | null;
  serialNumber?: string | null;
}

/** Tarifas efectivas: la pactada en la reserva pisa a la maestra si es > 0. */
export function resolveExtensionRates(
  forkliftRates: ExtensionRates,
  bookingMonthlyRate?: number | null,
): Required<Record<"daily" | "weekly" | "monthly", number>> {
  const booked = Number(bookingMonthlyRate) || 0;
  return {
    daily: Number(forkliftRates.daily_rate) || 0,
    weekly: Number(forkliftRates.weekly_rate) || 0,
    monthly: booked > 0 ? booked : Number(forkliftRates.monthly_rate) || 0,
  };
}

/**
 * Partidas de factura para el tramo extendido. Reutiliza `calculateRentalCost`
 * (mensual → semanal → diario) para respetar el mismo escalonado de tarifas
 * que una renta normal. Devuelve `[]` si no hay días cobrables o tarifas.
 */
export function buildExtensionLineItems({
  originalEndDate,
  newEndDate,
  forkliftRates,
  bookingMonthlyRate,
  forkliftName,
  serialNumber,
}: ExtensionLineItemsInput): LineItem[] {
  const range = extensionBillableRange(originalEndDate, newEndDate);
  if (!range) return [];

  const rates = resolveExtensionRates(forkliftRates, bookingMonthlyRate);
  // Fix 8.4: isExtension=true evita que el cap BL-15 cobre "mes completo"
  // sobre un tramo que ya es, por definición, adicional a una renta base.
  const items = calculateRentalCost(
    rates.daily,
    rates.weekly,
    rates.monthly,
    parseYmdNoon(range.start),
    parseYmdNoon(range.end),
    true,
  );

  const prefix = forkliftName ? `${forkliftName} — ` : "";
  const serieSuffix = serialNumber ? ` (Serie: ${serialNumber})` : "";
  return items.map((item) => ({
    ...item,
    description: `${prefix}Extensión: ${item.description} (${range.start} al ${range.end})${serieSuffix}`,
  }));
}
