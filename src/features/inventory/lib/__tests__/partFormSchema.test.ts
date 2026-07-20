import { describe, expect, it } from "vitest";
import { partFormSchema } from "../partFormSchema";

const base = {
  name: "Filtro",
  sku: "",
  category: "Filtros",
  stock_quantity: 10,
  min_stock_level: 5,
  unit_cost: 100,
};

describe("partFormSchema", () => {
  it("acepta payload válido", () => {
    expect(partFormSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza name vacío", () => {
    expect(partFormSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });

  it("rechaza category vacía", () => {
    expect(partFormSchema.safeParse({ ...base, category: "" }).success).toBe(false);
  });

  it("rechaza stock_quantity negativo o no entero", () => {
    expect(partFormSchema.safeParse({ ...base, stock_quantity: -1 }).success).toBe(false);
    expect(partFormSchema.safeParse({ ...base, stock_quantity: 1.5 }).success).toBe(false);
  });

  it("rechaza min_stock_level negativo", () => {
    expect(partFormSchema.safeParse({ ...base, min_stock_level: -5 }).success).toBe(false);
  });

  it("rechaza unit_cost negativo", () => {
    expect(partFormSchema.safeParse({ ...base, unit_cost: -0.01 }).success).toBe(false);
  });

  it("acepta unit_cost 0", () => {
    expect(partFormSchema.safeParse({ ...base, unit_cost: 0 }).success).toBe(true);
  });

  it("coacciona strings numéricos", () => {
    const r = partFormSchema.safeParse({
      ...base,
      stock_quantity: "10",
      min_stock_level: "5",
      unit_cost: "100",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stock_quantity).toBe(10);
      expect(r.data.unit_cost).toBe(100);
    }
  });
});
