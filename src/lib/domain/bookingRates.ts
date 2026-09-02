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
