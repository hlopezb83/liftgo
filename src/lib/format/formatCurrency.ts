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

/**
 * R21 C-3: formato compacto en es-MX para KPIs y ejes de gráfica.
 * $1,234,567 → "$1.23 M"  ·  $845,000 → "$845 K"  ·  $99,000 → "$99,000.00".
 * Debajo de $100K devuelve el formato completo (aún cabe en la card).
 */
export function formatCompactCurrency(
  amount: number | null | undefined,
  currency: string = "MXN",
): string {
  if (!isRenderable(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const v = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(amount / 1_000_000);
    return `$${v} M`;
  }
  if (abs >= 100_000) {
    const v = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(amount / 1_000);
    return `$${v} K`;
  }
  return getFormatter(currency).format(amount);
}

/**
 * R21 C-3: escala tipográfica del KPI según longitud del string formateado.
 * Evita ellipsis en el número principal: mejor bajar tamaño que truncar.
 */
export function kpiSizeClass(formatted: string): string {
  if (formatted.length > 14) return "text-lg";
  if (formatted.length > 10) return "text-xl";
  return "text-2xl";
}

