/**
 * Tarifas efectivas de una reserva (FIX-2).
 *
 * Regla canónica ÚNICA para todo el sistema (factura manual, extensión,
 * previews): cada tarifa pactada en la reserva pisa a la maestra del
 * montacargas **sólo si es > 0**; una tarifa nula o en 0 cae al catálogo.
 *
 * Antes, la factura manual usaba `booking.daily_rate ?? forklift.daily_rate`,
 * de modo que una tarifa pactada en 0 facturaba $0 mientras la extensión de la
 * MISMA reserva cobraba la tarifa de catálogo. Este helper elimina esa
 * divergencia sin cambiar ninguna regla de negocio del backend.
 */
export interface RateSet {
  daily_rate?: number | null;
  weekly_rate?: number | null;
  monthly_rate?: number | null;
}

export interface ResolvedRates {
  daily: number;
  weekly: number;
  monthly: number;
}

export function resolveBookingRates(
  forkliftRates: RateSet | null | undefined,
  bookingRates?: RateSet | null,
): ResolvedRates {
  // 8.44.3: si la reserva trae AL MENOS una tarifa pactada (> 0), esas tarifas
  // son el contrato completo: las que vienen en 0 NO caen al catálogo. El
  // cálculo de renta prorratea el remanente desde la mensual/semanal pactada
  // (p. ej. $15,000/mes → $500/día), igual que la cotización. Sólo una reserva
  // sin ninguna tarifa pactada usa las tarifas del montacargas.
  const hasPacted = [bookingRates?.daily_rate, bookingRates?.weekly_rate, bookingRates?.monthly_rate]
    .some((r) => (Number(r) || 0) > 0);
  if (hasPacted) {
    return {
      daily: Math.max(0, Number(bookingRates?.daily_rate) || 0),
      weekly: Math.max(0, Number(bookingRates?.weekly_rate) || 0),
      monthly: Math.max(0, Number(bookingRates?.monthly_rate) || 0),
    };
  }
  const pick = (booked: unknown, master: unknown): number => {
    const b = Number(booked) || 0;
    if (b > 0) return b;
    return Number(master) || 0;
  };
  return {
    daily: pick(bookingRates?.daily_rate, forkliftRates?.daily_rate),
    weekly: pick(bookingRates?.weekly_rate, forkliftRates?.weekly_rate),
    monthly: pick(bookingRates?.monthly_rate, forkliftRates?.monthly_rate),
  };
}
