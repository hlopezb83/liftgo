import { calculateRentalCost, applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import type { RentalLine } from "./RentalLineItems";

export function computeRentalLineTotal(line: RentalLine, startDate?: Date, endDate?: Date): number {
  if (!startDate || !endDate) return 0;
  const items = calculateRentalCost(line.dailyRate, line.weeklyRate, line.monthlyRate, startDate, endDate);
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const base = lineItemTotal(line.quantity, subtotal);
  return applyDiscountToBase(base, line.discount, line.discountType);
}
