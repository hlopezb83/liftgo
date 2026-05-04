import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, type Locale } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { APP_CONFIG } from "@/lib/config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parse a "YYYY-MM-DD" string as local date (not UTC) to avoid off-by-one errors. */
export function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split("T")[0].split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

export function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return format(parseDateLocal(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

/**
 * Format a Date or ISO string in Monterrey timezone using a date-fns pattern.
 * Centralized helper to avoid scattered `format(parseISO(...), 'dd/MM/yyyy')`.
 */
export function formatMtyDate(
  value: Date | string | null | undefined,
  pattern = "dd/MM/yyyy",
  locale?: Locale,
): string {
  if (!value) return "—";
  try {
    const date = typeof value === "string" ? new Date(value) : value;
    return format(toZonedTime(date, APP_CONFIG.TIMEZONE), pattern, locale ? { locale } : undefined);
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
