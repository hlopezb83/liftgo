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

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function computeLineContribution(
  line: RepLine,
  headerRate: number,
): { rate: number; base: number; grossLine: number; taxable: boolean } | null {
  if (!line || typeof line !== "object" || Array.isArray(line)) return null;
  const fallbackTotal = Number(line.quantity ?? 1) *
    Number(line.unit_price ?? 0);
  const raw = Number(line.total ?? fallbackTotal);
  const discount = Number(line.discount ?? 0);
  const rate = line.tax_rate ?? headerRate;
  if (![raw, discount, rate].every(isNonNegativeFinite)) return null;

  const gross = toCents(raw);
  const reduction = line.discount_type === "$"
    ? toCents(discount)
    : toCents((fromCents(gross) * Math.min(discount, 100)) / 100);
  const base = Math.max(0, gross - reduction);
  const taxable = (line.objeto_imp ?? "02") !== "01";
  const taxCents = taxable ? toCents((fromCents(base) * rate) / 100) : 0;
  return { rate, base, grossLine: base + taxCents, taxable };
}

function areValidSummaryTotals(
  grossCents: number,
  paidCents: number,
  bases: Iterable<number>,
): boolean {
  const allSafe = [grossCents, paidCents, ...bases].every(Number.isSafeInteger);
  return allSafe && grossCents > 0 && paidCents > 0 && paidCents <= grossCents;
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
    !isNonNegativeFinite(headerRate)
  ) {
    return null;
  }
  const groups = new Map<number, number>();
  let grossCents = 0;
  for (const line of lines) {
    const parsed = computeLineContribution(line, headerRate);
    if (!parsed) return null;
    grossCents += parsed.grossLine;
    if (parsed.taxable) {
      groups.set(parsed.rate, (groups.get(parsed.rate) ?? 0) + parsed.base);
    }
  }
  const paidCents = toCents(paidAmount);
  if (!areValidSummaryTotals(grossCents, paidCents, groups.values())) {
    return null;
  }
  return [...groups]
    .filter(([, base]) => base > 0)
    .map(([rate, base]) => {
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
