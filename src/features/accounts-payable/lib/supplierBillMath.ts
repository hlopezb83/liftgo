import { sumMoney } from "@/lib/money";

export function computeSupplierBillBalance(
  total: number | string,
  payments: ReadonlyArray<{ amount: number | string }> | null | undefined,
): { paidSum: number; computedBalance: number } {
  const paidSum = sumMoney((payments ?? []).map((payment) => Number(payment.amount)));
  const computedBalance = Math.max(0, sumMoney([Number(total), -paidSum]));
  return { paidSum, computedBalance };
}

export function computeAgingOverdueMetrics(totals: {
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}): { overdueTotal: number; overduePct: number } {
  const overdueTotal = sumMoney([totals.d1_30, totals.d31_60, totals.d61_90, totals.d90_plus]);
  const overduePct = totals.total > 0 ? (overdueTotal / totals.total) * 100 : 0;
  return { overdueTotal, overduePct };
}
