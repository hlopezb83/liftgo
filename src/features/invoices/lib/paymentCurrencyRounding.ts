// Preserve the public feature import while sharing exact decimal arithmetic
// with invoice totals. FX keeps its existing half-away-from-zero default.
export { roundConvertedAmount, roundCurrencyAmount } from "@/lib/money/decimalRounding";
