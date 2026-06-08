import { saleLineTotal } from "@/lib/domain/invoiceHelpers";
import type { SaleLine } from "./SaleLineItems";

export function computeSaleLineTotal(line: SaleLine): number {
  return saleLineTotal({
    quantity: line.quantity,
    unit_price: line.unitPrice,
    discount: line.discount,
    discount_type: line.discountType,
  });
}
