import { describe, it, expect } from "vitest";
import {
  lineItemTotal,
  applyDiscountToBase,
  applyDiscount,
  saleLineTotal,
  computeTotals,
  type LineItem,
} from "@/lib/domain/invoiceTotals";

describe("lineItemTotal", () => {
  it("multiplica cantidad por precio unitario", () => {
    expect(lineItemTotal(3, 100)).toBe(300);
  });

  it("devuelve 0 ante null, undefined, NaN o Infinity", () => {
    expect(lineItemTotal(null, 100)).toBe(0);
    expect(lineItemTotal(undefined, 100)).toBe(0);
    expect(lineItemTotal(3, null)).toBe(0);
    expect(lineItemTotal(NaN, 100)).toBe(0);
    expect(lineItemTotal(3, Infinity)).toBe(0);
  });

  it("admite decimales sin perder precisión MXN", () => {
    expect(lineItemTotal(3, 99.99)).toBeCloseTo(299.97, 2);
  });
});

describe("applyDiscountToBase", () => {
  it("descuento porcentual normal", () => {
    expect(applyDiscountToBase(1_000, 10, "%")).toBe(900);
  });

  it("descuento fijo en pesos", () => {
    expect(applyDiscountToBase(1_000, 150, "$")).toBe(850);
  });

  it("descuento por defecto es %", () => {
    expect(applyDiscountToBase(1_000, 20)).toBe(800);
  });

  it("descuento > base nunca devuelve negativo", () => {
    expect(applyDiscountToBase(100, 500, "$")).toBe(0);
    expect(applyDiscountToBase(100, 200, "%")).toBe(0);
  });

  it("R7 21.6 · descuento porcentual >100% se limita a 100% (base → 0)", () => {
    expect(applyDiscountToBase(1_000, 150, "%")).toBe(0);
    expect(applyDiscountToBase(1_000, 100, "%")).toBe(0);
    expect(applyDiscountToBase(1_000, 99.5, "%")).toBeCloseTo(5, 2);
  });

  it("descuento 0, null o undefined deja la base intacta", () => {
    expect(applyDiscountToBase(500, 0, "%")).toBe(500);
    expect(applyDiscountToBase(500, undefined, "$")).toBe(500);
  });

  it("base no finita → 0", () => {
    expect(applyDiscountToBase(NaN, 10, "%")).toBe(0);
  });
});

describe("applyDiscount (sobre line item)", () => {
  it("usa item.total como base", () => {
    const item: LineItem = { description: "x", quantity: 2, unit_price: 100, total: 200, discount: 25, discount_type: "%" };
    expect(applyDiscount(item)).toBe(150);
  });

  it("sin descuento → total intacto", () => {
    const item: LineItem = { description: "x", quantity: 1, unit_price: 50, total: 50 };
    expect(applyDiscount(item)).toBe(50);
  });
});

describe("saleLineTotal", () => {
  it("cantidad × precio − descuento %", () => {
    expect(saleLineTotal({ quantity: 4, unit_price: 100, discount: 10, discount_type: "%" })).toBe(360);
  });

  it("cantidad × precio − descuento $", () => {
    expect(saleLineTotal({ quantity: 4, unit_price: 100, discount: 50, discount_type: "$" })).toBe(350);
  });

  it("sin descuento", () => {
    expect(saleLineTotal({ quantity: 2, unit_price: 250 })).toBe(500);
  });
});

describe("computeTotals", () => {
  const mk = (total: number, discount?: number, discount_type?: "%" | "$"): LineItem => ({
    description: "x", quantity: 1, unit_price: total, total, discount, discount_type,
  });

  it("IVA 16% sobre subtotal sin descuentos", () => {
    const r = computeTotals([mk(1_000), mk(500)], 16);
    expect(r.subtotal).toBe(1_500);
    expect(r.taxAmount).toBe(240);
    expect(r.total).toBe(1_740);
  });

  it("IVA 8% (zona fronteriza)", () => {
    const r = computeTotals([mk(1_000)], 8);
    expect(r.taxAmount).toBe(80);
    expect(r.total).toBe(1_080);
  });

  it("IVA 0%", () => {
    const r = computeTotals([mk(1_000)], 0);
    expect(r.taxAmount).toBe(0);
    expect(r.total).toBe(1_000);
  });

  it("aplica descuentos por línea antes de calcular el IVA", () => {
    const r = computeTotals([mk(1_000, 10, "%"), mk(500, 50, "$")], 16);
    expect(r.subtotal).toBe(1_350); // 900 + 450
    expect(r.taxAmount).toBe(216);
    expect(r.total).toBe(1_566);
  });

  it("array vacío → todo en 0", () => {
    expect(computeTotals([], 16)).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });
});
