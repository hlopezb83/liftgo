import { format } from "date-fns";
import { toYMD } from "@/lib/date/toYMD";
import { parseDateLocal } from "@/lib/utils";

/**
 * GUI-FE-07 (G-ADM-05): utilidades para fechas "calendario" (columnas `date`).
 *
 * Una fecha calendario NO es un instante: representa un día en la agenda de
 * Monterrey. Los pickers la materializan como `Date` a medianoche LOCAL del
 * navegador, por lo que formatearla convirtiendo a America/Monterrey
 * (`toZonedTime`) corre el día un día atrás/adelante cuando la TZ del
 * navegador difiere. Estas helpers interpretan/formatean por componentes
 * locales, consistente con `toYMD()` que se usa al persistir.
 */

/** "YYYY-MM-DD" de una fecha calendario (componentes locales). */
export function toMtyYMD(date: Date | undefined | null): string | undefined {
  return toYMD(date);
}

/** Parsea "YYYY-MM-DD" como fecha calendario (medianoche local, sin desfase UTC). */
export function parseMtyDate(dateStr: string | null | undefined): Date | null {
  return parseDateLocal(dateStr);
}

/**
 * Formatea una fecha calendario SIN conversión de zona horaria.
 * Úsala para etiquetas de pickers y rangos de renta/contrato/cotización.
 */
export function formatMtyCalendarDate(
  date: Date | null | undefined,
  pattern = "dd/MM/yyyy",
): string {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return format(date, pattern);
}
