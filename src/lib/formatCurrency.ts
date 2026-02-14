import { APP_CONFIG } from "@/lib/config";

/**
 * Format a number as currency.
 * Example: formatCurrency(1234.5) → "€1,234.50"
 */
export function formatCurrency(amount: number): string {
  return `${APP_CONFIG.CURRENCY_SYMBOL}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
