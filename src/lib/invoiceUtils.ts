import type { Forklift } from "@/hooks/useForklifts";
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

export function calculateRentalCost(
  dailyRate: number | null,
  weeklyRate: number | null,
  monthlyRate: number | null,
  startDate: Date,
  endDate: Date
): LineItem[] {
  const items: LineItem[] = [];
  const effectiveDailyRate = dailyRate || 0;
  const effectiveWeeklyRate = weeklyRate || 0;
  const effectiveMonthlyRate = monthlyRate || 0;

  // Treat end date as inclusive: effective end = endDate + 1 day
  const effectiveEnd = addDays(endDate, 1);

  // Calendar months using inclusive end
  let months = 0;
  if (effectiveMonthlyRate > 0) {
    months = differenceInCalendarMonths(effectiveEnd, startDate);
    // Verify addMonths(startDate, months) doesn't exceed effectiveEnd
    if (months > 0 && addMonths(startDate, months) > effectiveEnd) {
      months -= 1;
    }
    if (months > 0) {
      items.push({ description: "Renta mensual", quantity: months, unit_price: effectiveMonthlyRate, total: months * effectiveMonthlyRate });
    }
  }

  const remainderStart = months > 0 ? addMonths(startDate, months) : startDate;
  // Remaining days = difference to effectiveEnd (no +1 needed, already inclusive)
  let remaining = differenceInDays(effectiveEnd, remainderStart);
  // If months consumed the entire range, remaining = 0
  if (remaining < 0) remaining = 0;

  // Weekly blocks (7 days)
  if (effectiveWeeklyRate > 0 && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    items.push({ description: "Renta semanal", quantity: weeks, unit_price: effectiveWeeklyRate, total: weeks * effectiveWeeklyRate });
    remaining -= weeks * 7;
  }

  // Remaining days
  if (remaining > 0 && effectiveDailyRate > 0) {
    items.push({ description: "Renta diaria", quantity: remaining, unit_price: effectiveDailyRate, total: remaining * effectiveDailyRate });
  } else if (remaining > 0 && effectiveDailyRate === 0) {
    const fallback = effectiveWeeklyRate > 0 ? effectiveWeeklyRate / 7 : effectiveMonthlyRate > 0 ? effectiveMonthlyRate / 30 : 0;
    if (fallback > 0) {
      items.push({ description: "Renta diaria", quantity: remaining, unit_price: Math.round(fallback * 100) / 100, total: Math.round(remaining * fallback * 100) / 100 });
    }
  }

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

export function computeTotals(lineItems: LineItem[], taxRate: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + applyDiscount(item), 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}
