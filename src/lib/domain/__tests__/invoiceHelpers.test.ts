import { describe, it, expect } from "vitest";
import {
  applyDiscount,
  calculateRentalCost,
  generateLineItemsFromModel,
  computeTotals,
  type LineItem,
} from "@/lib/domain/invoiceHelpers";

const item = (over: Partial<LineItem> = {}): LineItem => ({
  description: "x",
  quantity: 1,
  unit_price: 100,
  total: 100,
  ...over,
});

describe("applyDiscount", () => {
  it("retorna base sin descuento", () => {
    expect(applyDiscount(item({ total: 250 }))).toBe(250);
  });

  it("aplica descuento porcentual", () => {
    expect(applyDiscount(item({ total: 200, discount: 10, discount_type: "%" }))).toBe(180);
  });

  it("aplica descuento monetario", () => {
    expect(applyDiscount(item({ total: 200, discount: 50, discount_type: "$" }))).toBe(150);
  });

  it("no permite valores negativos", () => {
    expect(applyDiscount(item({ total: 100, discount: 500, discount_type: "$" }))).toBe(0);
  });
});

describe("calculateRentalCost", () => {
  it("genera renta mensual exacta para 1 mes calendario", () => {
    const items = calculateRentalCost(100, 500, 2000, new Date("2026-01-01"), new Date("2026-01-31"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "Renta mensual", quantity: 1, total: 2000 });
  });

  it("combina semanal + diaria cuando sobran días", () => {
    const items = calculateRentalCost(100, 500, 0, new Date("2026-01-01"), new Date("2026-01-10"));
    const desc = items.map((i) => i.description);
    expect(desc).toContain("Renta semanal");
    expect(desc).toContain("Renta diaria");
  });

  it("usa fallback diario derivado del mensual cuando no hay daily/weekly", () => {
    const items = calculateRentalCost(0, 0, 3000, new Date("2026-01-01"), new Date("2026-01-03"));
    expect(items[0].description).toBe("Renta diaria");
    expect(items[0].quantity).toBe(3);
    expect(items[0].unit_price).toBeCloseTo(100, 2);
  });

  it("retorna vacío cuando no hay tarifas", () => {
    expect(calculateRentalCost(0, 0, 0, new Date("2026-01-01"), new Date("2026-01-10"))).toEqual([]);
  });
});

describe("generateLineItemsFromModel", () => {
  it("prefija modelo y multiplica por cantidad", () => {
    const items = generateLineItemsFromModel("Toyota 8FBE", 0, 0, 2000, "2026-01-01", "2026-01-31", 3);
    expect(items[0].description).toContain("Toyota 8FBE (x3)");
    expect(items[0].total).toBe(6000);
    expect(items[0].unit_price).toBe(6000);
  });
});

describe("computeTotals", () => {
  it("calcula subtotal, IVA y total", () => {
    const r = computeTotals([item({ total: 1000 }), item({ total: 500 })], 16);
    expect(r.subtotal).toBe(1500);
    expect(r.taxAmount).toBe(240);
    expect(r.total).toBe(1740);
  });

  it("aplica descuentos antes de impuestos", () => {
    const r = computeTotals([item({ total: 1000, discount: 10, discount_type: "%" })], 16);
    expect(r.subtotal).toBe(900);
    expect(r.taxAmount).toBe(144);
    expect(r.total).toBe(1044);
  });
});
