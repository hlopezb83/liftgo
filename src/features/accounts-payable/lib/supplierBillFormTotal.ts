import { roundMoney } from "@/lib/money";

type AmountValue = number | string | null | undefined;
type BillAmounts = {
  currency?: string | null;
  exchange_rate?: AmountValue;
  subtotal?: AmountValue;
  discount?: AmountValue;
  tax_amount?: AmountValue;
  retention_iva?: AmountValue;
  retention_isr?: AmountValue;
};

const amountFields = ["subtotal", "discount", "tax_amount", "retention_iva", "retention_isr"] as const;

/** Metadata edits preserve the stored total; only monetary edits recalculate it. */
export function supplierBillFormTotal(values: BillAmounts, original?: (BillAmounts & { total: number }) | null) {
  if (original && values.currency === original.currency
      && Number(values.exchange_rate ?? 1) === Number(original.exchange_rate ?? 1)
      && amountFields.every((field) => Number(values[field] ?? 0) === Number(original[field] ?? 0))) {
    return original.total;
  }
  return roundMoney(Math.max(0, Number(values.subtotal ?? 0) - Number(values.discount ?? 0)
    + Number(values.tax_amount ?? 0) - Number(values.retention_iva ?? 0) - Number(values.retention_isr ?? 0)));
}
