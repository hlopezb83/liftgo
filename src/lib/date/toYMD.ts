/**
 * Convierte un Date a "YYYY-MM-DD" usando sus componentes locales (año/mes/día).
 * Úsalo para columnas Postgres tipo `date` — NUNCA uses `.toISOString().slice(0,10)`
 * porque puede correr el día cuando la Date tiene offset distinto al local.
 *
 * Para columnas `timestamptz` sí usar `.toISOString()`.
 */
export function toYMD(date: Date | undefined | null): string | undefined {
  if (!date) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
