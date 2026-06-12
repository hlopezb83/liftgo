import currency from "currency.js";

export interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  discount?: number;
  discount_type?: "%" | "$";
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
  const discountAmount = money(safeBase).multiply(discount).divide(100).value;
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

export function computeTotals(lineItems: LineItem[], taxRate: number) {
  const subtotal = lineItems.reduce(
    (sum, item) => sum.add(applyDiscount(item)),
    money(0)
  );
  const taxAmount = subtotal.multiply(taxRate).divide(100);
  const total = subtotal.add(taxAmount);
  return {
    subtotal: subtotal.value,
    taxAmount: taxAmount.value,
    total: total.value,
  };
}
