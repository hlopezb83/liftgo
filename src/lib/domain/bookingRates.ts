/**
 * Tarifas efectivas de una reserva (FIX-2).
 *
 * Regla canónica ÚNICA para todo el sistema (factura manual, extensión,
 * previews): si la reserva trae AL MENOS una tarifa pactada (> 0), esas
 * tarifas son el contrato completo y las que vienen en 0 NO caen al
 * catálogo — el cálculo de renta prorratea el remanente desde la
 * mensual/semanal pactada (p. ej. $15,000/mes → $500/día). Sólo una
 * reserva sin ninguna tarifa pactada usa las tarifas del montacargas.
 *
 * Antes, la factura manual usaba `booking.daily_rate ?? forklift.daily_rate`,
 * de modo que una tarifa pactada en 0 facturaba $0 mientras la extensión de
 * la MISMA reserva cobraba la tarifa de catálogo, y una tarifa diaria
 * derivada (prorrateada de la mensual) se perdía al no persistirse. Este
 * helper elimina esa divergencia sin cambiar ninguna regla de negocio del
 * backend.
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

/** Contrato pactado: las tarifas de la reserva mandan; los ceros quedan en 0. */
function resolvePactedRates(bookingRates: RateSet): ResolvedRates {
  return {
    daily: Math.max(0, Number(bookingRates.daily_rate) || 0),
    weekly: Math.max(0, Number(bookingRates.weekly_rate) || 0),
    monthly: Math.max(0, Number(bookingRates.monthly_rate) || 0),
  };
}

/** Sin tarifa pactada: cada tarifa en 0/nula cae al catálogo del montacargas. */
function resolveCatalogRates(forkliftRates: RateSet, bookingRates: RateSet): ResolvedRates {
  const pick = (booked: unknown, master: unknown): number => {
    const b = Number(booked) || 0;
    if (b > 0) return b;
    return Number(master) || 0;
  };
  return {
    daily: pick(bookingRates.daily_rate, forkliftRates.daily_rate),
    weekly: pick(bookingRates.weekly_rate, forkliftRates.weekly_rate),
    monthly: pick(bookingRates.monthly_rate, forkliftRates.monthly_rate),
  };
}

export function resolveBookingRates(
  forkliftRates: RateSet | null | undefined,
  bookingRates?: RateSet | null,
): ResolvedRates {
  const hasPacted = [bookingRates?.daily_rate, bookingRates?.weekly_rate, bookingRates?.monthly_rate]
    .some((r) => (Number(r) || 0) > 0);
  if (hasPacted) return resolvePactedRates(bookingRates ?? {});
  return resolveCatalogRates(forkliftRates ?? {}, bookingRates ?? {});
}
