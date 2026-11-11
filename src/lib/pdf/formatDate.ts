import { formatDateMty } from "@/lib/format/dateFormats";

export function fmtDate(date: string | null): string {
  return date ? formatDateMty(date) || "—" : "—";
}
