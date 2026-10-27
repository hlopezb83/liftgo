import { describe, expect, it } from "vitest";
import { buildExtensionLineItems, extensionBillableRange, resolveExtensionRates } from "../extensionBilling";

describe("extensionBillableRange", () => {
  it("cobra desde el día siguiente al fin original, fin inclusivo", () => {
    expect(extensionBillableRange("2026-08-11", "2026-08-18")).toEqual({
      start: "2026-08-12",
      end: "2026-08-18",
      days: 7,
    });
  });

  it("devuelve null si la extensión no agrega días", () => {
    expect(extensionBillableRange("2026-08-18", "2026-08-18")).toBeNull();
    expect(extensionBillableRange("2026-08-18", "2026-08-10")).toBeNull();
  });

  it("un solo día extra cuenta como 1", () => {
    expect(extensionBillableRange("2026-08-11", "2026-08-12")?.days).toBe(1);
  });
});

describe("resolveExtensionRates", () => {
  it("la tarifa pactada en la reserva pisa a la maestra", () => {
    const r = resolveExtensionRates(
      { daily_rate: 500, weekly_rate: 2800, monthly_rate: 9000 },
      { monthly_rate: 8000 },
    );
    // 8.44.3: con una tarifa pactada no se mezclan tarifas del catálogo.
    expect(r).toEqual({ daily: 0, weekly: 0, monthly: 8000 });
  });

  it("F1: las tarifas pactadas diaria y semanal también pisan a la maestra", () => {
    const r = resolveExtensionRates(
      { daily_rate: 500, weekly_rate: 2800, monthly_rate: 9000 },
      { daily_rate: 450, weekly_rate: 2500, monthly_rate: 8000 },
    );
    expect(r).toEqual({ daily: 450, weekly: 2500, monthly: 8000 });
  });

  it("ignora la pactada cuando es 0 o nula", () => {
    expect(resolveExtensionRates({ monthly_rate: 9000 }, { monthly_rate: 0 }).monthly).toBe(9000);
    expect(resolveExtensionRates({ monthly_rate: 9000 }, null).monthly).toBe(9000);
    expect(resolveExtensionRates({ monthly_rate: 9000 }).monthly).toBe(9000);
  });

  it("no cae al catálogo en diaria/semanal si hay una mensual pactada (se prorratea)", () => {
    const r = resolveExtensionRates(
      { daily_rate: 500, weekly_rate: 2800, monthly_rate: 9000 },
      { daily_rate: 0, weekly_rate: null, monthly_rate: 8000 },
    );
    expect(r).toEqual({ daily: 0, weekly: 0, monthly: 8000 });
  });
});

describe("buildExtensionLineItems", () => {
  it("genera partidas sólo del tramo extendido", () => {
    const items = buildExtensionLineItems({
      originalEndDate: "2026-08-11",
      newEndDate: "2026-08-18",
      forkliftRates: { daily_rate: 500, weekly_rate: 2800, monthly_rate: 9000 },
      forkliftName: "Toyota 8FGU25",
      serialNumber: "ABC123",
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].description).toContain("Extensión");
    expect(items[0].description).toContain("2026-08-12 al 2026-08-18");
    expect(items[0].description).toContain("Toyota 8FGU25");
    expect(items.reduce((s, i) => s + i.total, 0)).toBeGreaterThan(0);
  });

  it("devuelve [] si no hay días cobrables", () => {
    expect(
      buildExtensionLineItems({
        originalEndDate: "2026-08-18",
        newEndDate: "2026-08-18",
        forkliftRates: { daily_rate: 500 },
      }),
    ).toEqual([]);
  });

  it("devuelve [] si el equipo no tiene tarifas", () => {
    expect(
      buildExtensionLineItems({
        originalEndDate: "2026-08-11",
        newEndDate: "2026-08-18",
        forkliftRates: {},
      }),
    ).toEqual([]);
  });
});

describe("unidad SAT de las partidas de extensión", () => {
  it("un mes completo sale con MON, no con DAY", () => {
    const items = buildExtensionLineItems({
      originalEndDate: "2026-09-30",
      newEndDate: "2026-10-31",
      forkliftRates: { daily_rate: 500, monthly_rate: 30000 },
      bookingRates: { monthly_rate: 30000 },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 1, total: 30000, clave_unidad: "MON" });
  });

  it("semanas salen con WEE y días sueltos con DAY", () => {
    const items = buildExtensionLineItems({
      originalEndDate: "2026-08-11",
      newEndDate: "2026-08-20",
      forkliftRates: { daily_rate: 500, weekly_rate: 2800 },
    });
    expect(items.map((i) => [i.quantity, i.clave_unidad])).toEqual([[1, "WEE"], [2, "DAY"]]);
  });

  it("el prorrateo parcial de un mes sale como unidad de servicio E48", () => {
    const items = buildExtensionLineItems({
      originalEndDate: "2026-03-04",
      newEndDate: "2026-04-02",
      forkliftRates: { daily_rate: 500, monthly_rate: 9000 },
    });
    expect(items).toHaveLength(1);
    expect(items[0].description).toContain("prorrateo");
    expect(items[0]).toMatchObject({ quantity: 1, clave_unidad: "E48" });
  });
});
