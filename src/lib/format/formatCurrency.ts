import { APP_CONFIG } from "@/lib/config";

/**
 * Format a number as currency using the Mexican Peso (MXN) locale.
 * Example: formatCurrency(1234.5) → "$1,234.50"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(APP_CONFIG.LOCALE, {
    style: "currency",
    currency: APP_CONFIG.CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number as currency using a dynamic currency code.
 * Example: formatCurrencyWithCode(1234.5, "USD") → "$1,234.50"
 */
export function formatCurrencyWithCode(amount: number, currencyCode: string = "MXN"): string {
  return new Intl.NumberFormat(APP_CONFIG.LOCALE, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
