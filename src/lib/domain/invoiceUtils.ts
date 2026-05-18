import type { Forklift } from "@/features/fleet/hooks/forklifts/useForklifts";
import { differenceInDays, differenceInCalendarMonths, addMonths, addDays } from "date-fns";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  discount_type?: "%" | "$";
}

export function applyDiscount(item: LineItem): number {
  const base = item.total || 0;
  if (!item.discount || item.discount <= 0) return base;
  if (item.discount_type === "$") return Math.max(0, base - item.discount);
  return Math.max(0, base * (1 - item.discount / 100));
}

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
    return { description: "Renta diaria", quantity: remaining, unit_price: dailyRate, total: remaining * dailyRate };
  }
  const fallback = weeklyRate > 0 ? weeklyRate / 7 : monthlyRate > 0 ? monthlyRate / 30 : 0;
  if (fallback <= 0) return null;
  const unit = Math.round(fallback * 100) / 100;
  return { description: "Renta diaria", quantity: remaining, unit_price: unit, total: Math.round(remaining * fallback * 100) / 100 };
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
    items.push({ description: "Renta mensual", quantity: months, unit_price: m, total: months * m });
  }

  const remainderStart = months > 0 ? addMonths(startDate, months) : startDate;
  let remaining = Math.max(0, differenceInDays(effectiveEnd, remainderStart));

  if (w > 0 && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    items.push({ description: "Renta semanal", quantity: weeks, unit_price: w, total: weeks * w });
    remaining -= weeks * 7;
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
    unit_price: item.unit_price * quantity,
    total: item.total * quantity,
  }));
}

export function computeTotals(lineItems: LineItem[], taxRate: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + applyDiscount(item), 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}
