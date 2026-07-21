// BL-A5: helpers monetarios para Edge Functions (Deno).
// Paridad con `src/lib/money`: mantiene la aritmética en centavos enteros para
// evitar drift IEEE-754 sin depender de `currency.js` (npm) en Deno.
//
// Reglas:
//  - `toCents`: acepta number/string/null y devuelve entero.
//  - `fromCents`: convierte entero de centavos a number con 2 decimales.
//  - `sumMoneyCents`: suma entera exacta.
//  - `roundMoney`: redondea a 2 decimales (half-away-from-zero, alineado con
//    Facturapi/SAT y `Math.round`).
//  - `stampVariance`: calcula |local - remote| con precisión de centavos.

export function toCents(n: number | string | null | undefined): number {
  const v = typeof n === "string" ? Number(n) : n;
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  // Redondeo half-away-from-zero: Math.round(0.5) = 1, Math.round(-0.5) = 0
  // → usamos sign*floor(abs+0.5) para asegurar simetría con negativos.
  const scaled = v * 100;
  return scaled >= 0 ? Math.floor(scaled + 0.5) : -Math.floor(-scaled + 0.5);
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export function roundMoney(n: number | null | undefined): number {
  return fromCents(toCents(n));
}

export function sumMoneyCents(
  values: ReadonlyArray<number | null | undefined>,
): number {
  let acc = 0;
  for (const v of values) acc += toCents(v);
  return acc;
}

export function sumMoney(
  values: ReadonlyArray<number | null | undefined>,
): number {
  return fromCents(sumMoneyCents(values));
}

/**
 * Diferencia absoluta en pesos (2 decimales) entre el total local y el total
 * timbrado por Facturapi.
 */
export function stampVariance(
  localTotal: number | null | undefined,
  remoteTotal: number | null | undefined,
): number {
  const diffCents = toCents(localTotal) - toCents(remoteTotal);
  return fromCents(Math.abs(diffCents));
}

// BLOQUE 2.3: umbrales canónicos de varianza de timbrado (una sola fuente).
// - WARNING: varianzas ≤ 0.01 MXN son ruido por redondeo por línea (Facturapi
//   vs cálculo local) y no rompen 'stamped'.
// - ALERT: varianzas > 0.02 MXN merecen aviso al operador porque suelen
//   indicar diferencia de tasa o descuento mal aplicado.
export const STAMP_VARIANCE_WARNING = 0.01;
export const STAMP_VARIANCE_ALERT = 0.02;
/** Alias legacy; usar STAMP_VARIANCE_ALERT en código nuevo. */
export const STAMP_VARIANCE_TOLERANCE_MXN = STAMP_VARIANCE_ALERT;

/**
 * BL-A5 (canónico): comparación pura entre invoices.total y el total devuelto
 * por Facturapi tras timbrar. Devuelve null cuando alguno de los dos no es
 * un número finito. `withinTolerance` usa el umbral WARNING (1 centavo).
 */
export function computeStampVariance(
  invoiceTotal: unknown,
  stampedTotal: unknown,
): { variance: number; withinTolerance: boolean } | null {
  if (invoiceTotal == null || stampedTotal == null) return null;
  const expected = Number(invoiceTotal);
  const stamped = Number(stampedTotal);
  if (!Number.isFinite(expected) || !Number.isFinite(stamped)) return null;
  const variance = Math.round((stamped - expected) * 10000) / 10000;
  return {
    variance,
    withinTolerance: Math.abs(variance) <= STAMP_VARIANCE_WARNING,
  };
}

