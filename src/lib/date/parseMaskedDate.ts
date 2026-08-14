/**
 * Utilidades puras para el input enmascarado DD/MM/AAAA (DatePickerMx).
 *
 * Trabajan sobre "fecha calendario" con componentes locales (igual que
 * `toYMD` y `formatMtyCalendarDate`) — sin conversión de zona horaria.
 */

export type DateSegment = 0 | 1 | 2; // 0=día, 1=mes, 2=año

export const MASK_PLACEHOLDER = "dd/mm/aaaa";

/** Extrae hasta 8 dígitos. Acepta pegado ISO (`2026-09-15` → `15092026`). */
export function digitsOf(text: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;
  return text.replace(/\D/g, "").slice(0, 8);
}

/** Formatea dígitos parciales con las diagonales: `1509` → `15/09`. */
export function formatMask(digits: string): string {
  const d = digits.slice(0, 8);
  const parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter((p) => p.length > 0);
  return parts.join("/");
}

/** Dígitos a partir de un Date (`15/09/2026` → `15092026`). */
export function digitsFromDate(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${String(date.getFullYear()).padStart(4, "0")}`;
}

export interface ParsedMaskedDate {
  /** Fecha válida, o null si está incompleta o es imposible. */
  date: Date | null;
  /** true cuando hay 8 dígitos capturados. */
  complete: boolean;
  /** Mensaje de error para fechas completas pero imposibles. */
  error: string | null;
}

/** Parsea texto o dígitos a fecha calendario, validando bisiestos y días por mes. */
export function parseMaskedDate(text: string): ParsedMaskedDate {
  const digits = digitsOf(text);
  if (digits.length < 8) return { date: null, complete: false, error: null };

  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const invalid = { date: null, complete: true, error: `${formatMask(digits)} no existe` };

  if (month < 1 || month > 12 || day < 1 || year < 1900) return invalid;

  const candidate = new Date(year, month - 1, day);
  // Reconstrucción: JS "desborda" (31/02 → 03/03), así que comparamos componentes.
  const matches =
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day;
  if (!matches) return invalid;

  return { date: candidate, complete: true, error: null };
}

/** Segmento (día/mes/año) según la posición del cursor en el texto formateado. */
export function segmentAtCaret(caret: number): DateSegment {
  if (caret <= 2) return 0;
  if (caret <= 5) return 1;
  return 2;
}

/** Posición del cursor al final del segmento indicado. */
export function caretForSegment(segment: DateSegment, digits: string): number {
  const end = [2, 5, 10][segment];
  return Math.min(end, formatMask(digits).length);
}

const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate();

const wrap = (value: number, min: number, max: number) =>
  value < min ? max : value > max ? min : value;

/**
 * Incrementa/decrementa un segmento. Si la captura está incompleta, parte de
 * `fallback` (normalmente hoy). Ajusta el día cuando el mes destino es más corto.
 */
export function stepSegment(
  digits: string,
  segment: DateSegment,
  delta: number,
  fallback: Date,
): string {
  const parsed = parseMaskedDate(digits);
  const base = parsed.date ?? fallback;
  let day = base.getDate();
  let month = base.getMonth() + 1;
  let year = base.getFullYear();

  if (segment === 0) day = wrap(day + delta, 1, daysInMonth(year, month));
  else if (segment === 1) month = wrap(month + delta, 1, 12);
  else year = Math.min(2999, Math.max(1900, year + delta));

  day = Math.min(day, daysInMonth(year, month));
  return digitsFromDate(new Date(year, month - 1, day));
}
