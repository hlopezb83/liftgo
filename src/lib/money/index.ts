/**
 * Money rounding helpers.
 *
 * JavaScript floats (IEEE-754) produce binary tails on common decimal ops
 * (e.g. 0.1 + 0.2 = 0.30000000000000004). When persisting monetary values
 * to the database or aggregating across many rows, we want clean 2-decimal
 * numbers. Use these helpers at write boundaries and final aggregations,
 * not on every intermediate calculation.
 */

/**
 * Round a numeric value to 2 decimals using an epsilon adjustment to avoid
 * binary rounding artifacts. Returns 0 for non-finite inputs.
 */
export function roundMoney(n: number | null | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/**
 * Sum an array of monetary values and round the result to 2 decimals.
 * Skips NaN/undefined entries safely.
 */
export function sumMoney(values: ReadonlyArray<number | null | undefined>): number {
  let acc = 0;
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) acc += v;
  }
  return roundMoney(acc);
}

/**
 * Convierte un monto a MXN usando el tipo de cambio del documento.
 *
 * Reglas:
 *  - Si la moneda ya es MXN (o `null`, tratado como MXN por defecto), devuelve el monto tal cual.
 *  - Para monedas foráneas, multiplica por `fx` cuando es un número finito > 0.
 *  - Si `fx` es 0, `null`, `undefined` o no numérico, devuelve el monto SIN convertir
 *    y evita colapsar silenciosamente a 0. Los consumidores agregadores (cash-flow,
 *    accounts-payable, reportes) deben validar la calidad de datos si detectan
 *    `exchange_rate` inválido — este helper NO lo enmascara devolviendo 0.
 *
 * Centraliza la lógica que antes vivía en `cash-flow/lib/cashFlowTransformers.ts`
 * y estaba re-implementada de forma divergente en `accounts-payable`.
 */
export function toMxn(
  amount: number,
  currency: string | null | undefined,
  fx: number | string | null | undefined,
): number {
  const code = (currency ?? "MXN").toUpperCase();
  if (code === "MXN") return amount;
  const rate = Number(fx ?? 0);
  return Number.isFinite(rate) && rate > 0 ? amount * rate : amount;
}

