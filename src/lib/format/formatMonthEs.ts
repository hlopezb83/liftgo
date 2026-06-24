/**
 * Formatea una clave de mes "YYYY-MM" en español corto (es-MX), ej. "2026-06" → "Jun 26".
 * Independiente del locale del servidor PostgreSQL.
 */
export function formatMonthShortEs(monthKey: string): string {
  const [yy, mm] = monthKey.split("-").map(Number);
  if (!yy || !mm) return monthKey;
  const raw = new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" })
    .format(new Date(yy, mm - 1, 1))
    .replace(/\./g, "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
