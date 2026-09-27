import { APP_CONFIG } from "@/lib/config";

const amountFormatter = new Intl.NumberFormat(APP_CONFIG.LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatQuoteTotal(quote: { total: number; currency?: string | null }): string {
  const code = quote.currency?.trim().toUpperCase() || "MXN";
  if (!Number.isFinite(quote.total)) return "—";
  return `${amountFormatter.format(quote.total)} ${code}`;
}
