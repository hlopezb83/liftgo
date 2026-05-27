import { calculateRentalCost } from "@/lib/domain/invoiceHelpers";
import type { RentalLine } from "./RentalLineItems";

export function computeRentalLineTotal(line: RentalLine, startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 0;
  const items = calculateRentalCost(line.dailyRate, line.weeklyRate, line.monthlyRate, startDate, endDate);
  const base = items.reduce((sum, i) => sum + i.total, 0) * line.quantity;
  if (!line.discount || line.discount <= 0) return base;
  if (line.discountType === "$") return Math.max(0, base - line.discount);
  return Math.max(0, base * (1 - line.discount / 100));
}
