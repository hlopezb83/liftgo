import { describe, it, expect } from "vitest";
import { partFormSchema } from "../partFormSchema";

const base = { name: "Filtro", sku: "F-001", category: "filtros", stock_quantity: 5, min_stock_level: 1, unit_cost: 100 };

describe("partFormSchema", () => {
  it("acepta refacción válida", () => {
    expect(partFormSchema.safeParse(base).success).toBe(true);
  });

  it("rechaza sin nombre", () => {
    const r = partFormSchema.safeParse({ ...base, name: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza sin categoría", () => {
    const r = partFormSchema.safeParse({ ...base, category: "" });
    expect(r.success).toBe(false);
  });

  it("rechaza stock negativo", () => {
    expect(partFormSchema.safeParse({ ...base, stock_quantity: -1 }).success).toBe(false);
  });

  it("rechaza costo negativo", () => {
    expect(partFormSchema.safeParse({ ...base, unit_cost: -1 }).success).toBe(false);
  });

  it("coerce strings numéricas", () => {
    const r = partFormSchema.safeParse({ ...base, stock_quantity: "10", unit_cost: "50.5" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stock_quantity).toBe(10);
      expect(r.data.unit_cost).toBe(50.5);
    }
  });

  it("rechaza stock no entero", () => {
    expect(partFormSchema.safeParse({ ...base, stock_quantity: 1.5 }).success).toBe(false);
  });
});
