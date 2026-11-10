import { fromCents, toCents } from "../_shared/money.ts";

export interface RepLine {
  quantity?: number;
  unit_price?: number;
  total?: number;
  discount?: number;
  discount_type?: "%" | "$";
  objeto_imp?: string;
  tax_rate?: number;
}
export interface RepTax {
  base: number;
  type: "IVA";
  rate: number;
  factor: "Tasa";
}

/** Bases are in the related invoice currency, not the payment currency.
 * Each discounted source base receives the SAME paid fraction. Allocating a
 * gross payment by net-base weights distorts mixed tax rates. Round once per
 * grouped base, in cents; never assign a gross residual to an unrelated rate.
 */
export function repTaxBreakdown(
  lines: readonly RepLine[],
  headerRate: number,
  paidAmount: number,
): RepTax[] | null {
  if (
    !Number.isFinite(paidAmount) || paidAmount <= 0 ||
    !Number.isFinite(headerRate) || headerRate < 0
  ) return null;
  const groups = new Map<number, number>();
  let grossCents = 0;
  for (const line of lines) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return null;
    const raw = Number(
      line.total ?? Number(line.quantity ?? 1) * Number(line.unit_price ?? 0),
    );
    const discount = Number(line.discount ?? 0);
    const rate = line.tax_rate ?? headerRate;
    if (
      !Number.isFinite(raw) || raw < 0 || !Number.isFinite(discount) ||
      discount < 0 || !Number.isFinite(rate) || rate < 0
    ) return null;
    const gross = toCents(raw);
    const reduction = line.discount_type === "$"
      ? toCents(discount)
      : toCents(fromCents(gross) * Math.min(discount, 100) / 100);
    const base = Math.max(0, gross - reduction);
    const taxable = (line.objeto_imp ?? "02") !== "01";
    grossCents += base + (taxable ? toCents(fromCents(base) * rate / 100) : 0);
    if (taxable) groups.set(rate, (groups.get(rate) ?? 0) + base);
  }
  const paidCents = toCents(paidAmount);
  if (
    ![grossCents, paidCents, ...groups.values()].every(Number.isSafeInteger) ||
    grossCents <= 0 || paidCents <= 0 || paidCents > grossCents
  ) return null;
  return [...groups].filter(([, base]) => base > 0).map(([rate, base]) => {
    // Exact positive integer ratio with half-up ties, without an intermediate
    // floating-point product. Full payment reproduces every original base.
    const numerator = BigInt(base) * BigInt(paidCents);
    const denominator = BigInt(grossCents);
    const cents = Number((2n * numerator + denominator) / (2n * denominator));
    return {
      base: fromCents(cents),
      type: "IVA",
      rate: rate / 100,
      factor: "Tasa",
    };
  });
}
