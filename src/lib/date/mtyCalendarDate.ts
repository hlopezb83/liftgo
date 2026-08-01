import { format } from "date-fns";

/**
 * GUI-FE-07 (G-ADM-05): utilidades para fechas "calendario" (columnas `date`).
 *
 * Una fecha calendario NO es un instante: representa un día en la agenda de
 * Monterrey. Los pickers la materializan como `Date` a medianoche LOCAL del
 * navegador, por lo que formatearla convirtiendo a America/Monterrey
 * (`toZonedTime`) corre el día un día atrás/adelante cuando la TZ del
 * navegador difiere. Esta helper formatea por componentes locales,
 * consistente con `toYMD()` que se usa al persistir (usa `toYMD` /
 * `parseDateLocal` directamente para convertir).
 */


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
