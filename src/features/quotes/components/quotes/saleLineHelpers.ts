import type { SaleLine } from "./SaleLineItems";

export function computeSaleLineTotal(line: SaleLine): number {
  const base = line.quantity * line.unitPrice;
  if (!line.discount || line.discount <= 0) return base;
  if (line.discountType === "$") return Math.max(0, base - line.discount);
  return Math.max(0, base * (1 - line.discount / 100));
}
