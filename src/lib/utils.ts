import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

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
