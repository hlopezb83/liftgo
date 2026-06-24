/**
 * Helpers de formateo de meses en español (es-MX).
 * Fuente única de verdad — usar SIEMPRE estos helpers, nunca date-fns directo,
 * para evitar regresiones a inglés cuando se olvida `{ locale: es }`.
 */

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const shortFmt = new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" });
const longFmt = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });

/** "2026-06" → "Jun 26" */
export function formatMonthShortEs(monthKey: string): string {
  const [yy, mm] = monthKey.split("-").map(Number);
  if (!yy || !mm) return monthKey;
  return capitalize(shortFmt.format(new Date(yy, mm - 1, 1)).replace(/\./g, ""));
}

/** Date → "Jun 26" */
export function formatMonthShortEsFromDate(d: Date): string {
  return capitalize(shortFmt.format(d).replace(/\./g, ""));
}

/** Date → "Junio 2026" */
export function formatMonthLongEs(d: Date): string {
  return capitalize(longFmt.format(d));
}
