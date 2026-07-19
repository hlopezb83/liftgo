// Cálculo del prorrateo del primer ciclo recurrente (BL-12).
//
// Cuando una suscripción arranca a mitad de mes, cobrar la tarifa mensual
// completa es injusto: sólo se rentaron algunos días. Este helper devuelve
// el monto y el # de días facturables cuando corresponde prorratear.

export type ProrateResult = {
  billedAmount: number;
  isProrated: boolean;
  proratedDays: number;
  daysInMonth: number;
};

/**
 * @param startDay Día del mes del inicio (1..31). Si es 1 → sin prorrateo.
 * @param daysInMonth Días totales del mes destino (28..31).
 * @param monthlyRate Tarifa mensual base.
 */
export function computeProrate(
  startDay: number,
  daysInMonth: number,
  monthlyRate: number,
): ProrateResult {
  if (startDay <= 1) {
    return {
      billedAmount: monthlyRate,
      isProrated: false,
      proratedDays: daysInMonth,
      daysInMonth,
    };
  }
  const proratedDays = daysInMonth - startDay + 1;
  const raw = monthlyRate * proratedDays / daysInMonth;
  const billedAmount = Math.round(raw * 100) / 100;
  return { billedAmount, isProrated: true, proratedDays, daysInMonth };
}
