import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
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

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Returns the current date/time in the configured timezone (America/Monterrey). */
export function nowMty(): Date {
  return toZonedTime(new Date(), APP_CONFIG.TIMEZONE);
}
