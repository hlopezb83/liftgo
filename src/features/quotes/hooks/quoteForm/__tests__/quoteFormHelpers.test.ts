import { describe, it, expect } from "vitest";
import { buildSaleItems, buildRentalItems, type RentalLine, type SaleLine, type EquipmentModel } from "../quoteFormBuilders";

const models: EquipmentModel[] = [
  { id: "m1", manufacturer: "Toyota", model: "8FGCU25" },
  { id: "m2", manufacturer: "Hyster", model: "H50FT" },
];

describe("buildSaleItems", () => {
  it("filtra líneas inválidas y construye descripción Manufacturer Model", () => {
    const lines: SaleLine[] = [
      { modelId: "m1", quantity: 2, unitPrice: 100000 },
      { modelId: "", quantity: 1, unitPrice: 1 },
      { modelId: "m2", quantity: 0, unitPrice: 1 },
    ];
    const items = buildSaleItems(lines, models);
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Toyota 8FGCU25 - Venta de equipo");
    expect(items[0].total).toBe(200000);
  });

  it("usa default '%' para discount_type", () => {
    const items = buildSaleItems(
      [{ modelId: "m1", quantity: 1, unitPrice: 100, discount: 10 }],
      models,
    );
    expect(items[0].discount_type).toBe("%");
    expect(items[0].discount).toBe(10);
  });
});

describe("buildRentalItems", () => {
  it("genera líneas multiplicadas por cantidad de equipos", () => {
    const lines: RentalLine[] = [
      { modelId: "m1", quantity: 2, dailyRate: 0, weeklyRate: 0, monthlyRate: 1000 },
    ];
    const items = buildRentalItems(lines, models, new Date("2026-01-01"), new Date("2026-01-31"));
    expect(items.length).toBeGreaterThan(0);
    // 1 mes * $1000 * 2 equipos = $2000
    const monthly = items.find((i) => i.description.includes("Renta mensual"));
    expect(monthly?.total).toBe(2000);
    expect(monthly?.description).toContain("Toyota 8FGCU25");
    expect(monthly?.description).toContain("(x2)");
  });

  it("propaga descuento a cada línea generada", () => {
    const items = buildRentalItems(
      [{ modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 1000, discount: 15, discountType: "%" }],
      models, new Date("2026-01-01"), new Date("2026-01-31"),
    );
    expect(items.every((i) => i.discount === 15 && i.discount_type === "%")).toBe(true);
  });

  it("ignora líneas sin tarifas", () => {
    const items = buildRentalItems(
      [{ modelId: "m1", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }],
      models, new Date("2026-01-01"), new Date("2026-01-31"),
    );
    expect(items).toEqual([]);
  });
});
