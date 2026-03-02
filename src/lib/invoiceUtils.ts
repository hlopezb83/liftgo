import type { Forklift } from "@/hooks/useForklifts";
import { differenceInDays, differenceInCalendarMonths, addMonths } from "date-fns";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export function calculateRentalCost(
  dailyRate: number | null,
  weeklyRate: number | null,
  monthlyRate: number | null,
  startDate: Date,
  endDate: Date
): LineItem[] {
  const items: LineItem[] = [];
  const dr = dailyRate || 0;
  const wr = weeklyRate || 0;
  const mr = monthlyRate || 0;

  // Calendar months
  let months = 0;
  if (mr > 0) {
    months = differenceInCalendarMonths(endDate, startDate);
    // Verify addMonths(startDate, months) doesn't exceed endDate
    if (months > 0 && addMonths(startDate, months) > endDate) {
      months -= 1;
    }
    if (months > 0) {
      items.push({ description: "Renta mensual", quantity: months, unit_price: mr, total: months * mr });
    }
  }

  const remainderStart = months > 0 ? addMonths(startDate, months) : startDate;
  let remaining = differenceInDays(endDate, remainderStart);
  // Add 1 because rental includes both start and end day (only for the remainder)
  if (remaining >= 0) remaining += 1;
  // If months consumed the entire range exactly, remaining would be 1 (same day), skip it
  if (months > 0 && addMonths(startDate, months).getTime() === endDate.getTime()) {
    remaining = 0;
  }

  // Weekly blocks (7 days)
  if (wr > 0 && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    items.push({ description: "Renta semanal", quantity: weeks, unit_price: wr, total: weeks * wr });
    remaining -= weeks * 7;
  }

  // Remaining days
  if (remaining > 0 && dr > 0) {
    items.push({ description: "Renta diaria", quantity: remaining, unit_price: dr, total: remaining * dr });
  } else if (remaining > 0 && dr === 0) {
    const fallback = wr > 0 ? wr / 7 : mr > 0 ? mr / 30 : 0;
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
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  return { subtotal, taxAmount, total };
}
