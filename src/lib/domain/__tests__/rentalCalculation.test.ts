import { describe, it, expect } from "vitest";
import {
  calculateRentalCost,
  generateLineItems,
  generateLineItemsFromModel,
} from "@/lib/domain/rentalCalculation";
import type { Forklift } from "@/types/rental";

const d = (s: string) => new Date(`${s}T00:00:00`);

describe("calculateRentalCost", () => {
  it("solo mensual: 1 mes exacto (1 ene → 31 ene)", () => {
    const items = calculateRentalCost(0, 0, 10_000, d("2026-01-01"), d("2026-01-31"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      description: "Renta mensual",
      quantity: 1,
      unit_price: 10_000,
      total: 10_000,
    });
  });

  it("solo mensual: 3 meses exactos (1 ene → 31 mar)", () => {
    const items = calculateRentalCost(0, 0, 10_000, d("2026-01-01"), d("2026-03-31"));
    expect(items[0]).toMatchObject({ description: "Renta mensual", quantity: 3, total: 30_000 });
  });

  it("mensual + semanas: 1 mes y 14 días → 1 mensual + 2 semanas", () => {
    const items = calculateRentalCost(0, 2_000, 10_000, d("2026-01-01"), d("2026-02-14"));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ description: "Renta mensual", quantity: 1 });
    expect(items[1]).toMatchObject({ description: "Renta semanal", quantity: 2, total: 4_000 });
  });

  it("mensual + semanal + diario: 1 mes + 2 semanas + 3 días", () => {
    const items = calculateRentalCost(500, 2_000, 10_000, d("2026-01-01"), d("2026-02-17"));
    expect(items.map((i) => i.description)).toEqual([
      "Renta mensual",
      "Renta semanal",
      "Renta diaria",
    ]);
    expect(items[1]).toMatchObject({ quantity: 2 });
    expect(items[2]).toMatchObject({ quantity: 3, unit_price: 500, total: 1_500 });
  });

  it("solo semanal: 21 días → 3 semanas, sin diario", () => {
    const items = calculateRentalCost(0, 2_000, 0, d("2026-01-01"), d("2026-01-21"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "Renta semanal", quantity: 3, total: 6_000 });
  });

  it("fallback diario desde semanal cuando d=0 y resta < 7 días", () => {
    // 9 días: 1 semana + 2 días → diario fallback = w/7 = 2000/7 ≈ 285.71
    const items = calculateRentalCost(0, 2_000, 0, d("2026-01-01"), d("2026-01-09"));
    expect(items).toHaveLength(2);
    expect(items[1].description).toBe("Renta diaria");
    expect(items[1].quantity).toBe(2);
    expect(items[1].unit_price).toBeCloseTo(2_000 / 7, 2);
  });

  it("fallback diario desde mensual cuando d=0 y w=0 y meses no aplican", () => {
    // 5 días: sin mes, sin semana, fallback diario = m/30
    const items = calculateRentalCost(0, 0, 9_000, d("2026-01-01"), d("2026-01-05"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "Renta diaria", quantity: 5 });
    expect(items[0].unit_price).toBeCloseTo(300, 2);
  });

  it("todas las tarifas en cero → array vacío", () => {
    const items = calculateRentalCost(0, 0, 0, d("2026-01-01"), d("2026-01-31"));
    expect(items).toEqual([]);
  });

  it("start === end → 1 día (effectiveEnd = end+1)", () => {
    const items = calculateRentalCost(500, 0, 0, d("2026-01-01"), d("2026-01-01"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ description: "Renta diaria", quantity: 1, total: 500 });
  });
});

describe("generateLineItems", () => {
  const forklift: Forklift = {
    id: "fk-1",
    name: "Toyota 8FGCU25",
    daily_rate: 500,
    weekly_rate: 2_000,
    monthly_rate: 10_000,
  } as unknown as Forklift;

  it("prepone el nombre del montacargas a cada descripción", () => {
    const items = generateLineItems(forklift, "2026-01-01", "2026-01-31");
    expect(items[0].description).toBe("Toyota 8FGCU25 — Renta mensual");
  });
});

describe("generateLineItemsFromModel", () => {
  it("incluye (xN) y multiplica precio/total por cantidad", () => {
    const items = generateLineItemsFromModel(
      "Hyster H50FT",
      0,
      0,
      10_000,
      "2026-01-01",
      "2026-01-31",
      3,
    );
    expect(items[0].description).toBe("Hyster H50FT (x3) — Renta mensual");
    expect(items[0].unit_price).toBe(30_000);
    expect(items[0].total).toBe(30_000);
    expect(items[0].quantity).toBe(1); // cantidad de meses, no de unidades
  });
});
