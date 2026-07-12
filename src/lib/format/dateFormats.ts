/**
 * Presets de formato de fecha para la app (es-MX, TZ America/Monterrey).
 *
 * Fuente única de verdad — usar SIEMPRE estos helpers en lugar de invocar
 * `format(new Date(...), "dd/MM/yyyy")` inline en componentes.
 *
 * - `formatDateMty(v)`          → "12/07/2026"
 * - `formatDateTimeMty(v)`      → "12/07/2026 14:35"
 * - `formatDateLongMty(v)`      → "12 de julio de 2026"
 * - `formatDayMonthShortMty(v)` → "12 jul"
 * - `formatDateTimeShortMty(v)` → "12/07 14:35"
 * - `todayKeyMty()`             → "2026-07-12" (para query keys y comparaciones)
 * - `APP_LOCALE`                → locale es (re-export único)
 */
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatMtyDate, nowMty } from "@/lib/utils";

export const APP_LOCALE = es;

export const DATE_PATTERNS = {
  dateShort: "dd/MM/yyyy",
  dateTime: "dd/MM/yyyy HH:mm",
  dateLong: "dd 'de' MMMM 'de' yyyy",
  dayMonthShort: "dd MMM",
  dateTimeShort: "dd/MM HH:mm",
  isoDay: "yyyy-MM-dd",
} as const;

export const formatDateMty = (value: Date | string | null | undefined): string =>
  formatMtyDate(value, DATE_PATTERNS.dateShort);

export const formatDateTimeMty = (value: Date | string | null | undefined): string =>
  formatMtyDate(value, DATE_PATTERNS.dateTime);

// Presets disponibles bajo demanda (no exportados aún — activarlos cuando
// alguna vista los necesite para mantener a Knip contento):
// - dateLong ("12 de julio de 2026") y dayMonthShort ("12 jul") viven en
//   DATE_PATTERNS y pueden pasarse directo a `formatMtyDate`.

export const formatDateTimeShortMty = (value: Date | string | null | undefined): string =>
  formatMtyDate(value, DATE_PATTERNS.dateTimeShort);

/** Clave de fecha (YYYY-MM-DD) en TZ Monterrey. Útil para query keys que expiran diario. */
export const todayKeyMty = (): string => format(nowMty(), DATE_PATTERNS.isoDay);
