import currency from "currency.js";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  discount_type?: "%" | "$";
  /** SAT CFDI 4.0: "01" = no objeto de impuesto (no genera IVA). */
  objeto_imp?: string;
  /** Tasa de IVA en porcentaje para esta línea; si falta se usa la tasa global. */
  tax_rate?: number;
}


/** Wrap a number into a currency.js instance with MXN-compatible 2-decimal precision. */
export const money = (value: number) => currency(value, { precision: 2 });

/**
 * Total monetario de una línea de factura/cotización a partir de cantidad y precio unitario.
 * Single source of truth: cualquier handler que recalcule el total de una línea debe usar esta función.
 * Devuelve 0 ante valores no finitos.
 */
export function lineItemTotal(quantity: number | null | undefined, unitPrice: number | null | undefined): number {
  const q = typeof quantity === "number" && Number.isFinite(quantity) ? quantity : 0;
  const p = typeof unitPrice === "number" && Number.isFinite(unitPrice) ? unitPrice : 0;
  return money(p).multiply(q).value;
}

/**
 * Aplica un descuento (porcentual o monto fijo) a un monto base, usando currency.js.
 * Fuente única de verdad para descuentos monetarios. Nunca devuelve negativo.
 */
export function applyDiscountToBase(
  base: number,
  discount?: number,
  type?: "%" | "$",
): number {
  const safeBase = typeof base === "number" && Number.isFinite(base) ? base : 0;
  if (!discount || discount <= 0) return safeBase;
  if (type === "$") {
    const result = money(safeBase).subtract(discount).value;
    return Math.max(0, result);
  }
  // R7 Bloque 21.6: descuento porcentual limitado a 100% (antes clampeaba en silencio a 0).
  const pct = Math.min(discount, 100);
  const discountAmount = money(safeBase).multiply(pct).divide(100).value;
  const result = money(safeBase).subtract(discountAmount).value;
  return Math.max(0, result);
}

export function applyDiscount(item: LineItem): number {
  return applyDiscountToBase(item.total || 0, item.discount, item.discount_type);
}

export interface SaleLineInput {
  quantity: number;
  unit_price: number;
  discount?: number;
  discount_type?: "%" | "$";
}

/** Total de una línea de venta (cantidad × precio − descuento) vía currency.js. */
export function saleLineTotal(line: SaleLineInput): number {
  const base = lineItemTotal(line.quantity, line.unit_price);
  return applyDiscountToBase(base, line.discount, line.discount_type);
}

/**
 * S2-2.3: los impuestos se calculan LÍNEA POR LÍNEA para reflejar `objeto_imp`.
 * Las líneas con `objeto_imp === "01"` (no objeto de impuesto) no generan IVA,
 * igual que en `stamp-cfdi/handler.ts`, donde esas líneas van con `taxes: []`.
 * Cada línea puede además traer su propia `tax_rate`; si no, usa `taxRate`.
 */
export function computeTotals(lineItems: LineItem[], taxRate: number) {
  let subtotal = money(0);
  let taxAmount = money(0);

  for (const item of lineItems) {
    const base = applyDiscount(item);
    subtotal = subtotal.add(base);
    if (item.objeto_imp === "01") continue;
    const rate = typeof item.tax_rate === "number" && Number.isFinite(item.tax_rate)
      ? item.tax_rate
      : taxRate;
    if (!rate) continue;
    taxAmount = taxAmount.add(money(base).multiply(rate).divide(100));
  }

  const total = subtotal.add(taxAmount);
  return {
    subtotal: subtotal.value,
    taxAmount: taxAmount.value,
    total: total.value,
  };
}

