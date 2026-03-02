import type { Forklift } from "@/hooks/useForklifts";
import { differenceInDays } from "date-fns";

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
  days: number
): LineItem[] {
  const items: LineItem[] = [];
  let remaining = days;
  const dr = dailyRate || 0;
  const wr = weeklyRate || 0;
  const mr = monthlyRate || 0;

  // Monthly blocks (30 days)
  if (mr > 0 && remaining >= 30) {
    const months = Math.floor(remaining / 30);
    items.push({ description: `Renta mensual`, quantity: months, unit_price: mr, total: months * mr });
    remaining -= months * 30;
  }

  // Weekly blocks (7 days)
  if (wr > 0 && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    items.push({ description: `Renta semanal`, quantity: weeks, unit_price: wr, total: weeks * wr });
    remaining -= weeks * 7;
  }

  // Remaining days
  if (remaining > 0 && dr > 0) {
    items.push({ description: `Renta diaria`, quantity: remaining, unit_price: dr, total: remaining * dr });
  } else if (remaining > 0 && dr === 0) {
    // Fallback: if no daily rate, use weekly / 7 or monthly / 30
    const fallback = wr > 0 ? wr / 7 : mr > 0 ? mr / 30 : 0;
    if (fallback > 0) {
      items.push({ description: `Renta diaria`, quantity: remaining, unit_price: Math.round(fallback * 100) / 100, total: Math.round(remaining * fallback * 100) / 100 });
    }
  }

  return items;
}

export function generateLineItems(
  forklift: Forklift,
  startDate: string,
  endDate: string
): LineItem[] {
  const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
  const items = calculateRentalCost(forklift.daily_rate, forklift.weekly_rate, forklift.monthly_rate, days);
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
