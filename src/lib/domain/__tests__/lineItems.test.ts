import { describe, it, expect } from "vitest";
import { parseLineItems, parseRentalMeta, parseJsonbArray, toJsonArray, type LineItem } from "@/lib/domain/lineItems";

describe("parseLineItems", () => {
  it("devuelve array vacío para null/undefined/no-array", () => {
    expect(parseLineItems(null)).toEqual([]);
    expect(parseLineItems(undefined)).toEqual([]);
    expect(parseLineItems({} as never)).toEqual([]);
    expect(parseLineItems("string" as never)).toEqual([]);
  });

  it("narrowea JSONB array al tipo LineItem", () => {
    const json = [
      { description: "Renta mensual", quantity: 1, unit_price: 15000, tax_rate: 16 },
      { description: "Capacitación", quantity: 2, unit_price: 1000 },
    ];
    const items = parseLineItems(json as never);
    expect(items).toHaveLength(2);
    expect(items[0].description).toBe("Renta mensual");
    expect(items[0].unit_price).toBe(15000);
  });
});

describe("parseRentalMeta", () => {
  it("devuelve array vacío si no es array", () => {
    expect(parseRentalMeta(null)).toEqual([]);
  });

  it("narrowea metadata de rental multi-equipment", () => {
    const json = [
      { modelId: "model-a", quantity: 3, monthlyRate: 12000 },
      { modelId: "model-b", quantity: 1, dailyRate: 800, weeklyRate: 5000 },
    ];
    const meta = parseRentalMeta(json as never);
    expect(meta).toHaveLength(2);
    expect(meta[0].modelId).toBe("model-a");
    expect(meta[1].weeklyRate).toBe(5000);
  });
});

describe("parseJsonbArray", () => {
  it("es genérico y tolerante a non-arrays", () => {
    expect(parseJsonbArray<number>(null)).toEqual([]);
    expect(parseJsonbArray<{ x: number }>([{ x: 1 }] as never)).toEqual([{ x: 1 }]);
  });
});

describe("toJsonArray", () => {
  it("round-trips: serializar y parsear da el mismo contenido", () => {
    const items: LineItem[] = [
      { description: "A", quantity: 1, unit_price: 100 },
    ];
    const serialized = toJsonArray(items);
    const parsed = parseLineItems(serialized);
    expect(parsed).toEqual(items);
  });
});
