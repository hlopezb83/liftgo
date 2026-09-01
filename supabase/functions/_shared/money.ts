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
  // Redondeo half-away-from-zero robusto a IEEE-754: 1.005 * 100 == 100.4999...
  // toFixed(8) neutraliza el drift antes de Math.round, y el signo se aplica
  // manualmente para simetría con negativos (Math.round(-100.5) === -100 en JS).
  const sign = v < 0 ? -1 : 1;
  const cents = Math.round(Number((Math.abs(v) * 100).toFixed(8)));
  return sign * cents;
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

/**
 * A1-B2: IVA calculado LÍNEA POR LÍNEA y sumado, igual que
 * `src/lib/domain/invoiceTotals.ts:computeTotals` y que el criterio de
 * Facturapi al timbrar. Redondear una sola vez sobre el subtotal agregado
 * produce varianzas de centavos que hacen fallar el timbrado (BL-A5).
 */
export function sumLineTaxCents(
  amounts: ReadonlyArray<number | null | undefined>,
  taxRatePct: number,
): number {
  if (!Number.isFinite(taxRatePct) || taxRatePct <= 0) return 0;
  let acc = 0;
  for (const amount of amounts) {
    acc += Math.round(toCents(amount) * (taxRatePct / 100));
  }
  return acc;
}

/**
 * R9-14: tasa de IVA por defecto EN PORCENTAJE (0-100), espejo exacto de
 * `DEFAULT_VAT_RATE_PERCENT` en `src/lib/money/index.ts`. Úsala junto con
 * `resolveVatRatePercent` en generate-recurring-invoices para que el preview
 * de la UI y la generación real nunca diverjan sobre la tasa aplicada cuando
 * falta el dato en el cliente.
 */
export const DEFAULT_VAT_RATE_PERCENT = 16;

/**
 * Resuelve la tasa de IVA (en porcentaje, 0-100) a partir del `tax_rate` del
 * cliente. Reglas (R9-14):
 *  - null/undefined/NaN/fuera de [0,100] -> `DEFAULT_VAT_RATE_PERCENT` (16).
 *  - 0 explícito -> 0 (tasa exenta válida, NO se reemplaza por el default).
 *  - cualquier número finito en [0,100] -> se respeta tal cual.
 *
 * IMPORTANTE: antes se usaba `Number(customer?.tax_rate)` sin distinguir
 * "sin dato" (null) de "0% explícito", porque `Number(null) === 0`. Eso
 * generaba facturas recurrentes con IVA 0% inesperado cuando el cliente no
 * tenía `tax_rate` capturado.
 */
export function resolveVatRatePercent(
  rate: number | string | null | undefined,
): number {
  if (rate === null || rate === undefined) return DEFAULT_VAT_RATE_PERCENT;
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 100) return DEFAULT_VAT_RATE_PERCENT;
  return n;
}
