import { describe, it, expect } from "vitest";
import { buildSaleItems, buildRentalItems, type SaleLine, type RentalLine, type EquipmentModel } from "../quoteFormBuilders";

const models: EquipmentModel[] = [
  { id: "m1", manufacturer: "Toyota", model: "8FBE20" },
  { id: "m2", manufacturer: "Hyster", model: "H50" },
];

describe("buildSaleItems", () => {
  it("descarta líneas sin modelId, precio o cantidad", () => {
    const lines: SaleLine[] = [
      { modelId: "", quantity: 1, unitPrice: 100 },
      { modelId: "m1", quantity: 0, unitPrice: 100 },
      { modelId: "m1", quantity: 1, unitPrice: 0 },
      { modelId: "m1", quantity: 2, unitPrice: 500 },
    ];
    const items = buildSaleItems(lines, models);
    expect(items).toHaveLength(1);
    expect(items[0].total).toBe(1000);
    expect(items[0].description).toContain("Toyota 8FBE20");
    expect(items[0].description).toContain("Venta");
  });

  it("usa descripción genérica cuando el modelo no existe", () => {
    const items = buildSaleItems([{ modelId: "zz", quantity: 1, unitPrice: 100 }], models);
    expect(items[0].description).toBe("Venta de equipo");
  });

  it("aplica defaults de descuento (0 / %)", () => {
    const items = buildSaleItems([{ modelId: "m1", quantity: 1, unitPrice: 100 }], models);
    expect(items[0].discount).toBe(0);
    expect(items[0].discount_type).toBe("%");
  });
});

describe("buildRentalItems", () => {
  const start = new Date(2026, 2, 1); // 1-mar
  const end = new Date(2026, 2, 31);  // 31-mar (1 mes exacto)

  it("descarta líneas sin tarifa alguna", () => {
    const lines: RentalLine[] = [
      { modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 },
      { modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 1800 },
    ];
    const items = buildRentalItems(lines, models, start, end);
    expect(items.length).toBeGreaterThan(0);
  });

  it("propaga descuento a cada item generado por la línea", () => {
    const lines: RentalLine[] = [
      { modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 1800, discount: 10, discountType: "%" },
    ];
    const items = buildRentalItems(lines, models, start, end);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.discount).toBe(10);
      expect(it.discount_type).toBe("%");
    }
  });

  it("retorna vacío cuando no hay líneas válidas", () => {
    expect(buildRentalItems([], models, start, end)).toEqual([]);
  });
});
