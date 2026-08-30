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
      rate_type: "daily",
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
    rate_type: "daily",
  };
}

function monthlyItems(monthlyRate: number, months: number): LineItem[] {
  if (months <= 0) return [];
  return [
    {
      description: "Renta mensual",
      quantity: months,
      unit_price: monthlyRate,
      total: money(monthlyRate).multiply(months).value,
      rate_type: "monthly",
    },
  ];
}

/**
 * F2 / A5-01: detecta que `addMonths` clampeó el ancla del remanente porque el
 * día de inicio no existe en el mes destino (31-ene → 28-feb). El día clampeado
 * pertenece al mes ya facturado, así que el remanente debe arrancar al día
 * siguiente.
 */
function isClampedAnchor(months: number, remainderStart: Date, startDate: Date): boolean {
  return months > 0 && remainderStart.getDate() !== startDate.getDate();
}


export function calculateRentalCost(
  dailyRate: number | null,
  weeklyRate: number | null,
  monthlyRate: number | null,
  startDate: Date,
  endDate: Date,
  /**
   * Fix 8.4: en el tramo de una EXTENSIÓN el cliente ya pagó el mes base;
   * capear el remanente a "mes completo" cobraría días no rentados. Cuando
   * es `true`, el cap BL-15 no aplica un mes completo — en su lugar el
   * remanente se capea a `mensual × días/30` (prorrateo), nunca al mes entero.
   */
  isExtension = false,
): LineItem[] {
  const items: LineItem[] = [];
  const d = dailyRate ?? 0;
  const w = weeklyRate ?? 0;
  const m = monthlyRate ?? 0;

  const effectiveEnd = addDays(endDate, 1);
  const months = calcMonths(m, startDate, effectiveEnd);
  items.push(...monthlyItems(m, months));

  // F2 + A5-01: fin de mes corto. Si la renta arranca en un día que no existe
  // en el mes destino (p. ej. 31-ene → feb), `addMonths` clampea el ancla al
  // último día del mes (28-feb) y ese día YA quedó dentro del mes facturado.
  // El remanente debe arrancar el día siguiente; si no, el 28-feb se cobra dos
  // veces (31-ene → 01-mar facturaba 1 mes + 2 días en vez de 1 mes + 1 día).
  let remainderStart = months > 0 ? addMonths(startDate, months) : startDate;
  if (isClampedAnchor(months, remainderStart, startDate)) {
    remainderStart = addDays(remainderStart, 1);
  }

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
      rate_type: "weekly",
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
      if (isExtension) {
        // Fix 8.4: nunca cobrar el mes completo en una extensión — prorratear
        // en su lugar (mensual × días/30), capeando el costo escalonado.
        // A1-B1: la línea se emite con `quantity: 1` para que se cumpla la
        // invariante timbrable `total === unit_price × quantity`. Los días van
        // en la descripción; con `quantity = días` la división dejaba centavos
        // sueltos y Facturapi timbraba un importe distinto al de la factura.
        const prorated = money(m).multiply(remainderTotalDays).divide(DAYS_PER_MONTH_FALLBACK).value;
        const cappedTotal = Math.min(remainderCost, prorated);
        items.push({
          description: `Renta mensual (prorrateo ${remainderTotalDays} días)`,
          quantity: 1,
          unit_price: cappedTotal,
          total: cappedTotal,
          rate_type: "monthly",
        });

      } else {
        items.push({
          description: "Renta mensual",
          quantity: 1,
          unit_price: m,
          total: m,
          rate_type: "monthly",
        });
      }
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
