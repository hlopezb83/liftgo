import { calculateRentalCost, applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import type { RentalLine } from "./RentalLineItems";

export function computeRentalLineTotal(line: RentalLine, startDate?: Date, endDate?: Date): number {
  // R13-FE-01 (P1): partida legacy sin modelo -> mostrar el importe almacenado;
  // recalcular tarifa x periodo altera el precio acordado (COT-0001/0005).
  if (!line.modelId && line.legacyTotal != null) {
    return applyDiscountToBase(lineItemTotal(line.quantity, line.legacyTotal), line.discount, line.discountType);
  }
  if (!startDate || !endDate) return 0;
  const items = calculateRentalCost(line.dailyRate, line.weeklyRate, line.monthlyRate, startDate, endDate);
  const subtotal = items.reduce((sum, i) => sum + i.total, 0);
  const base = lineItemTotal(line.quantity, subtotal);
  return applyDiscountToBase(base, line.discount, line.discountType);
}
