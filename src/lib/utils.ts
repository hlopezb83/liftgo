import { clsx, type ClassValue } from "clsx";
import { format, type Locale } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { twMerge } from "tailwind-merge";
import { APP_CONFIG } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a "YYYY-MM-DD" (o "YYYY-MM") string as local date (not UTC) to avoid off-by-one errors.
 * Endurecido para no lanzar ante `null`/`undefined`/valores vacíos: devuelve `null`.
 */
export function parseDateLocal(
  dateStr: string | null | undefined,
): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const raw = dateStr.split("T")[0];
  const parts = raw.split("-");
  if (parts.length < 2) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = parts.length >= 3 ? Number(parts[2]) : 1;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = parseDateLocal(dateStr);
  if (!d) return "—";
  try {
    return format(d, "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

/**
 * Formato compacto para rango de fechas. Si inicio == fin muestra una sola fecha.
 * Usa guión largo y sin saltos de línea (whitespace-nowrap recomendado en celda).
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "—";
  if (!end) return formatDateDisplay(start);
  if (!start) return formatDateDisplay(end);
  if (start === end) return formatDateDisplay(start);
  return `${formatDateDisplay(start)} – ${formatDateDisplay(end)}`;
}

/** Detecta strings date-only (YYYY-MM-DD o YYYY-MM) sin componente horario. */
const DATE_ONLY_RE = /^\d{4}-\d{2}(-\d{2})?$/;

/**
 * Format a Date or ISO string in Monterrey timezone using a date-fns pattern.
 * Centralized helper to avoid scattered `format(parseISO(...), 'dd/MM/yyyy')`.
 *
 * Fix v7.145.0: strings date-only (`YYYY-MM-DD`, `YYYY-MM`) se parsean como fecha
 * LOCAL con `parseDateLocal` para evitar el off-by-one de UTC-medianoche →
 * Monterrey (síntomas: tooltip Gantt un día atrás, Estado de Resultados etiquetado
 * MAR–JUN cuando se pedían ABR–JUL).
 */
export function formatMtyDate(
  value: Date | string | null | undefined,
  pattern = "dd/MM/yyyy",
  locale?: Locale,
): string {
  if (!value) return "—";
  try {
    const isDateOnly = typeof value === "string" && DATE_ONLY_RE.test(value);
    let date: Date | null;
    if (typeof value === "string") {
      date = isDateOnly ? parseDateLocal(value) : new Date(value);
    } else {
      date = value;
    }
    if (!date || Number.isNaN(date.getTime())) {
      return typeof value === "string" ? value : "—";
    }
    // Para date-only ya está en zona local; no aplicar toZonedTime (rompería el día).
    const zoned = isDateOnly ? date : toZonedTime(date, APP_CONFIG.TIMEZONE);
    return format(zoned, pattern, locale ? { locale } : undefined);
  } catch {
    return typeof value === "string" ? value : "—";
  }
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Returns the current date/time in the configured timezone (America/Monterrey). */
export function nowMty(): Date {
  return toZonedTime(new Date(), APP_CONFIG.TIMEZONE);
}
