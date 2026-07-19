/**
 * Cálculo de depreciación prorrateada (BL-18).
 *
 * La regla LiftGo asume vida útil de 48 meses: `acquisition_cost / 48` por mes
 * completo rentado. Cuando una reserva sólo cubre parte de un mes (renta que
 * arranca el 20 o termina el 3), cargar el mes completo distorsiona el costo
 * mensual del Estado de Resultados. Este helper prorratea por días efectivos.
 *
 * @param acquisitionCost Costo de adquisición del equipo (MXN). Si es <= 0 o
 *   nulo, la depreciación es 0.
 * @param rentedDays Días rentados dentro del mes (0..daysInMonth).
 * @param daysInMonth Días totales del mes (28, 29, 30 ó 31).
 * @returns Depreciación en MXN, redondeada a 2 decimales.
 */
export function prorateDepreciation(
  acquisitionCost: number | null | undefined,
  rentedDays: number,
  daysInMonth: number,
): number {
  if (!acquisitionCost || acquisitionCost <= 0) return 0;
  if (rentedDays <= 0 || daysInMonth <= 0) return 0;
  const clampedDays = Math.min(rentedDays, daysInMonth);
  const monthly = acquisitionCost / 48;
  const value = monthly * (clampedDays / daysInMonth);
  return Math.round(value * 100) / 100;
}
