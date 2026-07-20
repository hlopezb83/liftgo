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
  return scaled >= 0
    ? Math.floor(scaled + 0.5)
    : -Math.floor(-scaled + 0.5);
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
 * timbrado por Facturapi. Si difieren en más de `toleranceMxn` MXN, el caller
 * debe alertar (variance fiscal potencial).
 */
export function stampVariance(
  localTotal: number | null | undefined,
  remoteTotal: number | null | undefined,
): number {
  const diffCents = toCents(localTotal) - toCents(remoteTotal);
  return fromCents(Math.abs(diffCents));
}

export const STAMP_VARIANCE_TOLERANCE_MXN = 0.02;
