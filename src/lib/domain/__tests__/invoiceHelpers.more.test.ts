import { describe, it, expect } from "vitest";
import {
  applyDiscount,
  calculateRentalCost,
  computeTotals,
  type LineItem,
} from "@/lib/domain/invoiceHelpers";

const item = (over: Partial<LineItem> = {}): LineItem => ({
  description: "test",
  quantity: 1,
  unit_price: 100,
  total: 100,
  ...over,
});

describe("applyDiscount — casos faltantes", () => {
  it("descuento porcentual = 100 → devuelve 0", () => {
    expect(
      applyDiscount(item({ total: 500, discount: 100, discount_type: "%" }))
    ).toBe(0);
  });
});

describe("calculateRentalCost — 45 días: 1 mes + 2 semanas + 1 día", () => {
  it("descompone en renta mensual + semanal + diaria", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-02-15");
    const items = calculateRentalCost(200, 800, 2000, start, end);

    const monthly = items.find((i) => i.description === "Renta mensual");
    const weekly = items.find((i) => i.description === "Renta semanal");
    const daily = items.find((i) => i.description === "Renta diaria");

    expect(monthly).toBeDefined();
    expect(monthly?.quantity).toBe(1);
    expect(monthly?.total).toBe(2000);

    expect(weekly).toBeDefined();
    expect(weekly?.quantity).toBe(2);
    expect(weekly?.total).toBe(1600);

    expect(daily).toBeDefined();
    expect(daily?.quantity).toBe(1);
    expect(daily?.total).toBe(200);
  });

  it("el orden de los ítems es mensual → semanal → diaria", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-02-15");
    const items = calculateRentalCost(200, 800, 2000, start, end);
    expect(items.map((i) => i.description)).toEqual([
      "Renta mensual",
      "Renta semanal",
      "Renta diaria",
    ]);
  });
});

describe("calculateRentalCost — start === end (1 día)", () => {
  it("con solo tarifa diaria devuelve 1 día exacto", () => {
    const date = new Date("2026-03-15");
    const items = calculateRentalCost(350, 0, 0, date, date);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "Renta diaria",
      quantity: 1,
      unit_price: 350,
      total: 350,
    });
  });

  it("con tarifa mensual usa fallback monthly/30 para 1 día", () => {
    const date = new Date("2026-03-15");
    const items = calculateRentalCost(0, 0, 3000, date, date);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Renta diaria");
    expect(items[0].quantity).toBe(1);
    expect(items[0].unit_price).toBeCloseTo(100, 2);
    expect(items[0].total).toBeCloseTo(100, 2);
  });

  it("con tarifa semanal usa fallback weekly/7 para 1 día", () => {
    const date = new Date("2026-03-15");
    const items = calculateRentalCost(0, 700, 0, date, date);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Renta diaria");
    expect(items[0].quantity).toBe(1);
    expect(items[0].unit_price).toBeCloseTo(100, 2);
    expect(items[0].total).toBeCloseTo(100, 2);
  });
});

describe("calculateRentalCost — solo tarifa diaria", () => {
  it("3 días con solo daily devuelve un único ítem diario", () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-04-03");
    const items = calculateRentalCost(150, 0, 0, start, end);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "Renta diaria",
      quantity: 3,
      unit_price: 150,
      total: 450,
    });
  });

  it("6 días (< semana) con daily no genera ítem semanal", () => {
    const start = new Date("2026-04-01");
    const end = new Date("2026-04-06");
    const items = calculateRentalCost(100, 600, 0, start, end);
    const descs = items.map((i) => i.description);
    expect(descs).not.toContain("Renta semanal");
    expect(descs).toContain("Renta diaria");
  });
});

describe("computeTotals — IVA 0 % (exento)", () => {
  it("taxAmount = 0 y total = subtotal cuando taxRate = 0", () => {
    const result = computeTotals(
      [item({ total: 1000 }), item({ total: 500 })],
      0
    );
    expect(result.subtotal).toBe(1500);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(1500);
  });

  it("aplica descuentos y mantiene IVA = 0", () => {
    const result = computeTotals(
      [item({ total: 1000, discount: 100, discount_type: "$" })],
      0
    );
    expect(result.subtotal).toBe(900);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(900);
  });
});

describe("computeTotals — IVA 16 % edge de redondeo", () => {
  it("redondea taxAmount a 2 decimales en montos no exactos", () => {
    const result = computeTotals([item({ total: 333.33 })], 16);
    expect(result.subtotal).toBe(333.33);
    expect(result.taxAmount).toBeCloseTo(53.33, 2);
    expect(result.total).toBeCloseTo(386.66, 2);
  });

  it("lista vacía devuelve todo en cero con cualquier IVA", () => {
    const result = computeTotals([], 16);
    expect(result.subtotal).toBe(0);
    expect(result.taxAmount).toBe(0);
    expect(result.total).toBe(0);
  });
});
