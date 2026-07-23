import { differenceInCalendarDays } from "date-fns";

/**
 * Días de renta facturables (fin inclusivo).
 *
 * Convención de LiftGo: la última fecha del rango también se cobra
 * (el `daterange` en Postgres usa el operador `[]`). Por eso siempre
 * `+ 1` sobre la diferencia de días de calendario. Extraído de 5
 * cálculos inline (BookingsPage, EquipmentListView, useGanttSegments,
 * RentalFinancialSummary, utilizationHelpers) para tener una fuente
 * única de verdad. Lote C · DIFF 10b.
 */
export function rentalDaysInclusive(start: Date, end: Date): number {
  return differenceInCalendarDays(end, start) + 1;
}
