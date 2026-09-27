import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

export function formatQuoteTotal(quote: { total: number; currency?: string | null }): string {
  const code = quote.currency?.trim().toUpperCase() || "MXN";
  return `${formatCurrencyWithCode(quote.total, code)} ${code}`;
}
