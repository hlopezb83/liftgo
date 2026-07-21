import { APP_CONFIG } from "@/lib/config";

/**
 * Format a number as currency using the Mexican Peso (MXN) locale.
 * Example: formatCurrency(1234.5) → "$1,234.50"
 *
 * Perf: `Intl.NumberFormat` se instancia una sola vez por moneda y se
 * reutiliza (construcción ~50-200µs cada vez). Crítico en tablas grandes.
 */
const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  const key = `${APP_CONFIG.LOCALE}:${currency}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(APP_CONFIG.LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatterCache.set(key, f);
  }
  return f;
}

// Bloque 5.3 (R4): un `NaN`/`null`/`undefined` en cash-flow disparaba "$NaN"
// en la UI. Centralizamos el guard aquí para cubrir todos los callsites.
function isRenderable(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function formatCurrency(amount: number | null | undefined): string {
  if (!isRenderable(amount)) return "—";
  return getFormatter(APP_CONFIG.CURRENCY).format(amount);
}

/**
 * Format a number as currency using a dynamic currency code.
 * Example: formatCurrencyWithCode(1234.5, "USD") → "$1,234.50"
 */
export function formatCurrencyWithCode(
  amount: number | null | undefined,
  currencyCode: string = "MXN",
): string {
  if (!isRenderable(amount)) return "—";
  return getFormatter(currencyCode).format(amount);
}
