import currency from "currency.js";
import type { Forklift } from "@/types/rental";
import { differenceInDays, differenceInCalendarMonths, addMonths, addDays } from "date-fns";
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

  if (w > 0 && remaining >= DAYS_PER_WEEK) {
    const weeks = Math.floor(remaining / DAYS_PER_WEEK);
    items.push({
      description: "Renta semanal",
      quantity: weeks,
      unit_price: w,
      total: money(w).multiply(weeks).value,
    });
    remaining -= weeks * DAYS_PER_WEEK;
  }

  const dailyItem = buildDailyRemainder(remaining, d, w, m);
  if (dailyItem) items.push(dailyItem);

  return items;
}

export function generateLineItems(
  forklift: Forklift,
  startDate: string,
  endDate: string
): LineItem[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const items = calculateRentalCost(forklift.daily_rate, forklift.weekly_rate, forklift.monthly_rate, start, end);
  return items.map((item) => ({
    ...item,
    description: `${forklift.name} — ${item.description}`,
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
  const start = new Date(startDate);
  const end = new Date(endDate);
  const items = calculateRentalCost(dailyRate, weeklyRate, monthlyRate, start, end);
  return items.map((item) => ({
    ...item,
    description: `${modelName} (x${quantity}) — ${item.description}`,
    quantity: item.quantity,
    unit_price: money(item.unit_price).multiply(quantity).value,
    total: money(item.total).multiply(quantity).value,
  }));
}
