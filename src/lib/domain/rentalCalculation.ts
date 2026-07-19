import currency from "currency.js";
import { differenceInDays, differenceInCalendarMonths, addMonths, addDays } from "date-fns";
import type { Forklift } from "@/types/rental";
import { money, type LineItem } from "./invoiceTotals";

/** Días que componen una semana de renta (constante de dominio). */
const DAYS_PER_WEEK = 7;
/**
 * Días que se asumen por mes cuando hay que prorratear desde tarifa mensual
 * hacia tarifa diaria como fallback (no se usa para calcular meses reales —
 * ese cálculo usa `differenceInCalendarMonths`).
 */
const DAYS_PER_MONTH_FALLBACK = 30;


function calcMonths(monthlyRate: number, startDate: Date, effectiveEnd: Date): number {
  if (monthlyRate <= 0) return 0;
  let months = differenceInCalendarMonths(effectiveEnd, startDate);
  if (months > 0 && addMonths(startDate, months) > effectiveEnd) months -= 1;
  return Math.max(0, months);
}

function buildDailyRemainder(
  remaining: number,
  dailyRate: number,
  weeklyRate: number,
  monthlyRate: number,
): LineItem | null {
  if (remaining <= 0) return null;
  if (dailyRate > 0) {
    return {
      description: "Renta diaria",
      quantity: remaining,
      unit_price: dailyRate,
      total: money(dailyRate).multiply(remaining).value,
    };
  }
  let fallback: currency | null = null;
  if (weeklyRate > 0) fallback = money(weeklyRate).divide(DAYS_PER_WEEK);
  else if (monthlyRate > 0) fallback = money(monthlyRate).divide(DAYS_PER_MONTH_FALLBACK);
  if (!fallback || fallback.value <= 0) return null;
  return {
    description: "Renta diaria",
    quantity: remaining,
    unit_price: fallback.value,
    total: fallback.multiply(remaining).value,
  };
}

export function calculateRentalCost(
  dailyRate: number | null,
  weeklyRate: number | null,
  monthlyRate: number | null,
  startDate: Date,
  endDate: Date
): LineItem[] {
  const items: LineItem[] = [];
  const d = dailyRate || 0;
  const w = weeklyRate || 0;
  const m = monthlyRate || 0;

  const effectiveEnd = addDays(endDate, 1);
  const months = calcMonths(m, startDate, effectiveEnd);
  if (months > 0) {
    items.push({
      description: "Renta mensual",
      quantity: months,
      unit_price: m,
      total: money(m).multiply(months).value,
    });
  }

  const remainderStart = months > 0 ? addMonths(startDate, months) : startDate;
  let remaining = Math.max(0, differenceInDays(effectiveEnd, remainderStart));

  // Buffer separado para poder aplicar el cap BL-15 sin tocar los meses ya
  // facturados a tarifa mensual (esos representan calendario cerrado).
  const remainderItems: LineItem[] = [];

  if (w > 0 && remaining >= DAYS_PER_WEEK) {
    const weeks = Math.floor(remaining / DAYS_PER_WEEK);
    remainderItems.push({
      description: "Renta semanal",
      quantity: weeks,
      unit_price: w,
      total: money(w).multiply(weeks).value,
    });
    remaining -= weeks * DAYS_PER_WEEK;
  }

  const dailyItem = buildDailyRemainder(remaining, d, w, m);
  if (dailyItem) remainderItems.push(dailyItem);

  // BL-15: si el remanente (semanal + diario) alcanza ~28-31 días y su costo
  // excede la tarifa mensual, capear a un mes completo. Sin esto una renta
  // que por timezone o calendario partido queda como "29-30 días" cobra más
  // que un mes cerrado — anti-intuitivo y desventajoso para el cliente.
  if (m > 0 && remainderItems.length > 0) {
    const remainderTotalDays = remainderItems.reduce(
      (acc, it) => acc + (it.description === "Renta semanal" ? it.quantity * DAYS_PER_WEEK : it.quantity),
      0,
    );
    const remainderCost = remainderItems.reduce((acc, it) => acc + it.total, 0);
    if (remainderTotalDays >= 28 && remainderCost > m) {
      items.push({
        description: "Renta mensual",
        quantity: 1,
        unit_price: m,
        total: m,
      });
    } else {
      items.push(...remainderItems);
    }
  } else {
    items.push(...remainderItems);
  }

  return items;
}

/**
 * Parsea una fecha en formato YMD (`2026-01-01`) o ISO completa a un `Date`
 * estable en zona local, anclado al mediodía. Anclar a 12:00 evita el bug de
 * timezone (BL-14): `new Date("2026-01-01")` parsea como UTC medianoche, que
 * en America/Monterrey (UTC-6) representa 2025-12-31 18:00 local, corriendo
 * `differenceInCalendarMonths` un día hacia atrás y facturando "1 mes + 1 día"
 * en rentas de calendario cerrado.
 */
function parseRentalDate(input: string): Date {
  // Solo YMD: anclar a mediodía local para blindar contra DST y timezone.
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(`${input}T12:00:00`);
  }
  // ISO completa u otro formato: respetar tal cual.
  return new Date(input);
}

export function generateLineItems(
  forklift: Forklift,
  startDate: string,
  endDate: string
): LineItem[] {
  const start = parseRentalDate(startDate);
  const end = parseRentalDate(endDate);
  const items = calculateRentalCost(forklift.daily_rate, forklift.weekly_rate, forklift.monthly_rate, start, end);
  const serieSuffix = forklift.serial_number ? ` (Serie: ${forklift.serial_number})` : "";
  return items.map((item) => ({
    ...item,
    description: `${forklift.name} — ${item.description}${serieSuffix}`,
  }));
}

export function generateLineItemsFromModel(
  modelName: string,
  dailyRate: number,
  weeklyRate: number,
  monthlyRate: number,
  startDate: string,
  endDate: string,
  quantity: number = 1
): LineItem[] {
  const start = parseRentalDate(startDate);
  const end = parseRentalDate(endDate);
  const items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, start, end);
  return items.map((item) => ({
    ...item,
    description: `${modelName} (x${quantity}) — ${item.description}`,
    quantity: item.quantity,
    unit_price: money(item.unit_price).multiply(quantity).value,
    total: money(item.total).multiply(quantity).value,
  }));
}
