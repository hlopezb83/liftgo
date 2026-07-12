/**
 * Money rounding helpers.
 *
 * Delegan la aritmética a `currency.js` (2 decimales, MXN-compatible) para
 * evitar drift de IEEE-754 sin depender del truco `Number.EPSILON`. Usar en
 * fronteras de persistencia y agregaciones finales, no en cada cálculo
 * intermedio.
 */
import currency from "currency.js";

const MONEY_OPTS = { precision: 2 } as const;

/**
 * Redondea a 2 decimales monetarios vía `currency.js`. Devuelve 0 para
 * entradas no finitas.
 */
export function roundMoney(n: number | null | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return currency(v, MONEY_OPTS).value;
}

/**
 * Suma una lista de montos y redondea a 2 decimales SOLO al final. Ignora
 * NaN/undefined. Acumula con alta precisión (10 dec) para evitar que cada
 * `.add()` redondee prematuramente y produzca drift (p.ej. 1.005+2.005+3.005
 * debe dar 6.02, no 6.03).
 */
const ACC_OPTS = { precision: 10 } as const;
export function sumMoney(values: ReadonlyArray<number | null | undefined>): number {
  let acc = currency(0, ACC_OPTS);
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) acc = acc.add(v);
  }
  return currency(acc.value, MONEY_OPTS).value;
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

/**
 * Tasa de IVA general vigente en México (16%).
 * Centralizada para evitar magic numbers (`* 1.16`) dispersos en el código.
 * Nota: NO usar como fuente de verdad para facturación fiscal — ahí siempre
 * viene del campo `tax_rate` de cada línea/documento.
 */
export const DEFAULT_VAT_RATE = 0.16;

/** Aplica IVA a un monto usando la tasa por defecto (o una custom). */
export function applyVat(amount: number, rate: number = DEFAULT_VAT_RATE): number {
  return amount * (1 + rate);
}


